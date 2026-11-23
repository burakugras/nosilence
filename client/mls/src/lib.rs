// SPDX-License-Identifier: AGPL-3.0-only
//
// MLS group keys for voice end-to-end encryption (ADR 0007).
//
// One `VoiceGroup` per device and voice channel. Its signing and HPKE keys are
// created for this call only and never leave the device. Group changes
// (commits) and Welcome messages travel through our server, which orders them
// but cannot read them. Every member derives the same 32-byte voice key for
// each epoch with the MLS exporter; the server never learns it.

use openmls::prelude::{tls_codec::*, *};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use wasm_bindgen::prelude::*;

const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
/// Label for the MLS exporter; changing it changes every derived key.
const VOICE_KEY_LABEL: &str = "nosilence voice key";

/// Errors stay plain Rust values (so native tests can check them) and become
/// JavaScript errors only at the WebAssembly boundary.
#[derive(Debug)]
pub struct Error(String);

impl Error {
    fn new(message: &str) -> Self {
        Error(message.to_owned())
    }
}

impl From<Error> for JsValue {
    fn from(e: Error) -> JsValue {
        JsError::new(&e.0).into()
    }
}

fn err(e: impl std::fmt::Debug) -> Error {
    Error(format!("{e:?}"))
}

fn identity_of(credential: &Credential) -> Result<String, Error> {
    let basic = BasicCredential::try_from(credential.clone()).map_err(err)?;
    String::from_utf8(basic.identity().to_vec()).map_err(err)
}

/// A commit we created, waiting for the server to accept it.
#[wasm_bindgen]
pub struct Commit {
    commit: Vec<u8>,
    welcome: Option<Vec<u8>>,
}

#[wasm_bindgen]
impl Commit {
    /// For the other group members.
    #[wasm_bindgen(getter)]
    pub fn commit(&self) -> Vec<u8> {
        self.commit.clone()
    }

    /// For the member being added, if any.
    #[wasm_bindgen(getter)]
    pub fn welcome(&self) -> Option<Vec<u8>> {
        self.welcome.clone()
    }
}

#[wasm_bindgen]
pub struct VoiceGroup {
    provider: OpenMlsRustCrypto,
    signer: SignatureKeyPair,
    credential: CredentialWithKey,
    group: Option<MlsGroup>,
}

#[wasm_bindgen]
impl VoiceGroup {
    /// `identity` is the account id; other members show it as a name.
    #[wasm_bindgen(constructor)]
    pub fn new(identity: &str) -> Result<VoiceGroup, Error> {
        let provider = OpenMlsRustCrypto::default();
        let signer = SignatureKeyPair::new(CIPHERSUITE.signature_algorithm()).map_err(err)?;
        signer.store(provider.storage()).map_err(err)?;
        let credential = CredentialWithKey {
            credential: BasicCredential::new(identity.as_bytes().to_vec()).into(),
            signature_key: signer.public().into(),
        };
        Ok(VoiceGroup {
            provider,
            signer,
            credential,
            group: None,
        })
    }

    /// A key package (public) that a member needs to add us.
    #[wasm_bindgen(js_name = keyPackage)]
    pub fn key_package(&self) -> Result<Vec<u8>, Error> {
        let bundle = KeyPackage::builder()
            .build(
                CIPHERSUITE,
                &self.provider,
                &self.signer,
                self.credential.clone(),
            )
            .map_err(err)?;
        bundle.key_package().tls_serialize_detached().map_err(err)
    }

    /// Starts the group as its only member, with the id the server assigned.
    pub fn create(&mut self, group_id: &[u8]) -> Result<(), Error> {
        let config = MlsGroupCreateConfig::builder()
            .ciphersuite(CIPHERSUITE)
            // Joiners get the ratchet tree inside the Welcome and need nothing else.
            .use_ratchet_tree_extension(true)
            .build();
        let group = MlsGroup::new_with_group_id(
            &self.provider,
            &self.signer,
            &config,
            GroupId::from_slice(group_id),
            self.credential.clone(),
        )
        .map_err(err)?;
        self.group = Some(group);
        Ok(())
    }

    /// Prepares adding the owner of `key_package`, which must belong to
    /// `expected_identity` (the account the server says sent it).
    pub fn add(&mut self, key_package: &[u8], expected_identity: &str) -> Result<Commit, Error> {
        let key_package = KeyPackageIn::tls_deserialize(&mut &key_package[..])
            .map_err(err)?
            .validate(self.provider.crypto(), ProtocolVersion::Mls10)
            .map_err(err)?;
        if identity_of(key_package.leaf_node().credential())? != expected_identity {
            return Err(Error::new("key package belongs to someone else"));
        }
        let group = self.group.as_mut().ok_or_else(|| Error::new("no group"))?;
        let (commit, welcome, _) = group
            .add_members(
                &self.provider,
                &self.signer,
                core::slice::from_ref(&key_package),
            )
            .map_err(err)?;
        Ok(Commit {
            commit: commit.tls_serialize_detached().map_err(err)?,
            welcome: Some(welcome.tls_serialize_detached().map_err(err)?),
        })
    }

    /// Prepares removing every leaf of `identity` (someone who left).
    pub fn remove(&mut self, identity: &str) -> Result<Commit, Error> {
        let group = self.group.as_ref().ok_or_else(|| Error::new("no group"))?;
        let mut leaves = Vec::new();
        for member in group.members() {
            if identity_of(&member.credential)? == identity {
                leaves.push(member.index);
            }
        }
        if leaves.is_empty() {
            return Err(Error::new("not a member"));
        }
        let group = self.group.as_mut().ok_or_else(|| Error::new("no group"))?;
        let (commit, _, _) = group
            .remove_members(&self.provider, &self.signer, &leaves)
            .map_err(err)?;
        Ok(Commit {
            commit: commit.tls_serialize_detached().map_err(err)?,
            welcome: None,
        })
    }

    /// The server accepted our commit: move to the new epoch.
    #[wasm_bindgen(js_name = mergePending)]
    pub fn merge_pending(&mut self) -> Result<(), Error> {
        let group = self.group.as_mut().ok_or_else(|| Error::new("no group"))?;
        group.merge_pending_commit(&self.provider).map_err(err)
    }

    /// The server refused our commit (someone else's came first): forget it.
    #[wasm_bindgen(js_name = discardPending)]
    pub fn discard_pending(&mut self) -> Result<(), Error> {
        let group = self.group.as_mut().ok_or_else(|| Error::new("no group"))?;
        group
            .clear_pending_commit(self.provider.storage())
            .map_err(err)
    }

    /// Applies another member's commit, accepted by the server.
    #[wasm_bindgen(js_name = applyCommit)]
    pub fn apply_commit(&mut self, commit: &[u8]) -> Result<(), Error> {
        let message = MlsMessageIn::tls_deserialize(&mut &commit[..])
            .map_err(err)?
            .try_into_protocol_message()
            .map_err(err)?;
        let group = self.group.as_mut().ok_or_else(|| Error::new("no group"))?;
        let processed = group
            .process_message(&self.provider, message)
            .map_err(err)?;
        match processed.into_content() {
            ProcessedMessageContent::StagedCommitMessage(staged) => group
                .merge_staged_commit(&self.provider, *staged)
                .map_err(err),
            _ => Err(Error::new("not a commit")),
        }
    }

    /// Joins from a Welcome; the group must be the one the server announced.
    pub fn join(&mut self, welcome: &[u8], expected_group_id: &[u8]) -> Result<(), Error> {
        let message = MlsMessageIn::tls_deserialize(&mut &welcome[..]).map_err(err)?;
        let MlsMessageBodyIn::Welcome(welcome) = message.extract() else {
            return Err(Error::new("not a Welcome message"));
        };
        // Like `create`: our own Welcomes must carry the ratchet tree, or anyone
        // we add later cannot join (we may be adding the group's founder back).
        let config = MlsGroupJoinConfig::builder()
            .use_ratchet_tree_extension(true)
            .build();
        let group = StagedWelcome::new_from_welcome(&self.provider, &config, welcome, None)
            .map_err(err)?
            .into_group(&self.provider)
            .map_err(err)?;
        if group.group_id().as_slice() != expected_group_id {
            return Err(Error::new("Welcome is for another group"));
        }
        self.group = Some(group);
        Ok(())
    }

    /// 32-byte voice key for the current epoch.
    #[wasm_bindgen(js_name = voiceKey)]
    pub fn voice_key(&self) -> Result<Vec<u8>, Error> {
        self.group()?
            .export_secret(self.provider.crypto(), VOICE_KEY_LABEL, &[], 32)
            .map_err(err)
    }

    /// Current epoch (version of the group key), or -1 without a group.
    pub fn epoch(&self) -> f64 {
        self.group
            .as_ref()
            .map_or(-1.0, |g| g.epoch().as_u64() as f64)
    }

    /// Account ids of everyone the key is shared with, including us.
    pub fn members(&self) -> Result<Vec<String>, Error> {
        self.group()?
            .members()
            .map(|m| identity_of(&m.credential))
            .collect()
    }

    /// Thirty digits every member sees identically in the same epoch. If two
    /// people compare them and they differ, someone is in the middle.
    #[wasm_bindgen(js_name = verificationCode)]
    pub fn verification_code(&self) -> Result<String, Error> {
        let auth = self.group()?.epoch_authenticator().as_slice().to_vec();
        let (chunks, _) = auth.as_chunks::<4>();
        Ok(chunks
            .iter()
            .take(6)
            .map(|c| format!("{:05}", u32::from_be_bytes(*c) % 100_000))
            .collect::<Vec<_>>()
            .join(" "))
    }
}

impl VoiceGroup {
    fn group(&self) -> Result<&MlsGroup, Error> {
        self.group.as_ref().ok_or_else(|| Error::new("no group"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GROUP: &[u8] = b"channel-1:generation-1";

    /// Adds `joiner` through `committer`; `others` apply the commit.
    fn add(
        committer: &mut VoiceGroup,
        others: &mut [&mut VoiceGroup],
        joiner: &mut VoiceGroup,
        id: &str,
    ) {
        let commit = committer.add(&joiner.key_package().unwrap(), id).unwrap();
        committer.merge_pending().unwrap();
        for other in others.iter_mut() {
            other.apply_commit(&commit.commit()).unwrap();
        }
        joiner.join(&commit.welcome().unwrap(), GROUP).unwrap();
    }

    fn trio() -> (VoiceGroup, VoiceGroup, VoiceGroup) {
        let mut a = VoiceGroup::new("alfa").unwrap();
        let mut b = VoiceGroup::new("bravo").unwrap();
        let mut c = VoiceGroup::new("charlie").unwrap();
        a.create(GROUP).unwrap();
        add(&mut a, &mut [], &mut b, "bravo");
        add(&mut a, &mut [&mut b], &mut c, "charlie");
        (a, b, c)
    }

    #[test]
    fn members_share_one_key_epoch_and_verification_code() {
        let (a, b, c) = trio();
        let key = a.voice_key().unwrap();
        assert_eq!(key.len(), 32);
        assert_eq!(key, b.voice_key().unwrap());
        assert_eq!(key, c.voice_key().unwrap());
        assert_eq!(a.epoch(), 2.0);
        assert_eq!(b.epoch(), c.epoch());
        let code = a.verification_code().unwrap();
        assert_eq!(code.len(), 35, "six groups of five digits");
        assert_eq!(code, c.verification_code().unwrap());
        assert_eq!(a.members().unwrap(), vec!["alfa", "bravo", "charlie"]);
    }

    #[test]
    fn a_member_who_leaves_cannot_follow_the_new_key() {
        let (mut a, mut b, c) = trio();
        let old = c.voice_key().unwrap();

        // Charlie left; bravo removes them and alfa applies the change.
        let commit = b.remove("charlie").unwrap();
        b.merge_pending().unwrap();
        a.apply_commit(&commit.commit()).unwrap();

        let new = a.voice_key().unwrap();
        assert_eq!(new, b.voice_key().unwrap());
        assert_ne!(new, old);
        assert_eq!(a.members().unwrap(), vec!["alfa", "bravo"]);
        assert_ne!(
            a.verification_code().unwrap(),
            c.verification_code().unwrap()
        );
    }

    #[test]
    fn joining_changes_the_key_so_newcomers_cannot_read_the_past() {
        let mut a = VoiceGroup::new("alfa").unwrap();
        let mut b = VoiceGroup::new("bravo").unwrap();
        a.create(GROUP).unwrap();
        let before = a.voice_key().unwrap();
        add(&mut a, &mut [], &mut b, "bravo");
        assert_ne!(before, b.voice_key().unwrap());
    }

    #[test]
    fn someone_who_joined_from_a_welcome_can_add_the_next_member() {
        // Alfa started the group and leaves; bravo adds alfa back. Bravo's
        // Welcome must carry the ratchet tree too, or joining fails.
        let mut a = VoiceGroup::new("alfa").unwrap();
        let mut b = VoiceGroup::new("bravo").unwrap();
        let mut c = VoiceGroup::new("charlie").unwrap();
        a.create(GROUP).unwrap();
        add(&mut a, &mut [], &mut b, "bravo");
        add(&mut b, &mut [&mut a], &mut c, "charlie");
        assert_eq!(c.voice_key().unwrap(), b.voice_key().unwrap());
        assert_eq!(c.members().unwrap(), vec!["alfa", "bravo", "charlie"]);
    }

    #[test]
    fn a_key_package_for_another_account_is_refused() {
        let mut a = VoiceGroup::new("alfa").unwrap();
        let mallory = VoiceGroup::new("mallory").unwrap();
        a.create(GROUP).unwrap();
        assert!(a.add(&mallory.key_package().unwrap(), "bravo").is_err());
        assert_eq!(a.epoch(), 0.0);
    }

    #[test]
    fn a_welcome_for_another_group_is_refused() {
        let mut a = VoiceGroup::new("alfa").unwrap();
        let mut b = VoiceGroup::new("bravo").unwrap();
        a.create(b"another group").unwrap();
        let commit = a.add(&b.key_package().unwrap(), "bravo").unwrap();
        assert!(b.join(&commit.welcome().unwrap(), GROUP).is_err());
    }

    #[test]
    fn a_refused_commit_is_discarded_and_the_competing_one_applies() {
        let (mut a, mut b, mut c) = trio();
        // Both prepare a change for the same epoch; the server takes bravo's.
        let _ours = a.remove("charlie").unwrap();
        let theirs = b.remove("charlie").unwrap();
        b.merge_pending().unwrap();

        a.discard_pending().unwrap();
        a.apply_commit(&theirs.commit()).unwrap();
        assert_eq!(a.voice_key().unwrap(), b.voice_key().unwrap());
        // Charlie, removed, cannot apply a commit of a later epoch.
        let next = a.remove("bravo").unwrap();
        assert!(c.apply_commit(&next.commit()).is_err());
    }

    #[test]
    fn an_outsider_gets_an_unrelated_key() {
        let (a, _, _) = trio();
        let mut outsider = VoiceGroup::new("outsider").unwrap();
        outsider.create(GROUP).unwrap();
        assert_ne!(a.voice_key().unwrap(), outsider.voice_key().unwrap());
    }
}

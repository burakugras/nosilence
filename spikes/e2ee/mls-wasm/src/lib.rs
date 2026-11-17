// SPDX-License-Identifier: AGPL-3.0-only
//
// Phase 1.5 spike (throwaway): can openmls run in the browser and give two
// participants the same media key without the server learning it?
//
// One `Member` per browser tab. The creator makes a group and adds the joiner
// from the joiner's key package; the joiner enters with the Welcome message.
// Both then derive the same voice key with the MLS exporter.

use openmls::prelude::{tls_codec::*, *};
use openmls_basic_credential::SignatureKeyPair;
use openmls_rust_crypto::OpenMlsRustCrypto;
use wasm_bindgen::prelude::*;

const CIPHERSUITE: Ciphersuite = Ciphersuite::MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519;
/// Label for the MLS exporter; changing it changes every derived key.
const VOICE_KEY_LABEL: &str = "nosilence voice key";

#[wasm_bindgen]
pub struct Member {
    provider: OpenMlsRustCrypto,
    signer: SignatureKeyPair,
    credential: CredentialWithKey,
    group: Option<MlsGroup>,
}

fn js_err(e: impl std::fmt::Debug) -> JsError {
    JsError::new(&format!("{e:?}"))
}

#[wasm_bindgen]
impl Member {
    #[wasm_bindgen(constructor)]
    pub fn new(identity: &str) -> Result<Member, JsError> {
        let provider = OpenMlsRustCrypto::default();
        let signer = SignatureKeyPair::new(CIPHERSUITE.signature_algorithm()).map_err(js_err)?;
        signer.store(provider.storage()).map_err(js_err)?;
        let credential = CredentialWithKey {
            credential: BasicCredential::new(identity.as_bytes().to_vec()).into(),
            signature_key: signer.public().into(),
        };
        Ok(Member { provider, signer, credential, group: None })
    }

    /// A fresh key package (public) that the creator needs to add us.
    #[wasm_bindgen(js_name = keyPackage)]
    pub fn key_package(&self) -> Result<Vec<u8>, JsError> {
        let bundle = KeyPackage::builder()
            .build(CIPHERSUITE, &self.provider, &self.signer, self.credential.clone())
            .map_err(js_err)?;
        bundle.key_package().tls_serialize_detached().map_err(js_err)
    }

    /// Starts a new group with only us in it.
    #[wasm_bindgen(js_name = createGroup)]
    pub fn create_group(&mut self) -> Result<(), JsError> {
        let config = MlsGroupCreateConfig::builder()
            .ciphersuite(CIPHERSUITE)
            // Put the ratchet tree into Welcome messages so joiners need nothing else.
            .use_ratchet_tree_extension(true)
            .build();
        let group = MlsGroup::new(&self.provider, &self.signer, &config, self.credential.clone())
            .map_err(js_err)?;
        self.group = Some(group);
        Ok(())
    }

    /// Adds a member from their key package. Returns the Welcome message for them.
    #[wasm_bindgen(js_name = addMember)]
    pub fn add_member(&mut self, key_package: &[u8]) -> Result<Vec<u8>, JsError> {
        let group = self.group.as_mut().ok_or_else(|| JsError::new("no group"))?;
        let key_package = KeyPackageIn::tls_deserialize(&mut &key_package[..])
            .map_err(js_err)?
            .validate(self.provider.crypto(), ProtocolVersion::Mls10)
            .map_err(js_err)?;
        let (_commit, welcome, _group_info) = group
            .add_members(&self.provider, &self.signer, core::slice::from_ref(&key_package))
            .map_err(js_err)?;
        group.merge_pending_commit(&self.provider).map_err(js_err)?;
        welcome.tls_serialize_detached().map_err(js_err)
    }

    /// Joins a group from a Welcome message created by `add_member`.
    pub fn join(&mut self, welcome: &[u8]) -> Result<(), JsError> {
        let message = MlsMessageIn::tls_deserialize(&mut &welcome[..]).map_err(js_err)?;
        let MlsMessageBodyIn::Welcome(welcome) = message.extract() else {
            return Err(JsError::new("not a Welcome message"));
        };
        let group = StagedWelcome::new_from_welcome(
            &self.provider,
            &MlsGroupJoinConfig::default(),
            welcome,
            None,
        )
        .map_err(js_err)?
        .into_group(&self.provider)
        .map_err(js_err)?;
        self.group = Some(group);
        Ok(())
    }

    /// 32-byte voice key for the current epoch. Same for every group member,
    /// unknown to anyone outside the group (including the server).
    #[wasm_bindgen(js_name = voiceKey)]
    pub fn voice_key(&self) -> Result<Vec<u8>, JsError> {
        let group = self.group.as_ref().ok_or_else(|| JsError::new("no group"))?;
        group
            .export_secret(self.provider.crypto(), VOICE_KEY_LABEL, &[], 32)
            .map_err(js_err)
    }

    pub fn epoch(&self) -> Option<u64> {
        self.group.as_ref().map(|g| g.epoch().as_u64())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn two_members_derive_the_same_key_and_an_outsider_does_not() {
        let mut alfa = Member::new("alfa").unwrap();
        let mut bravo = Member::new("bravo").unwrap();
        let mut outsider = Member::new("outsider").unwrap();

        alfa.create_group().unwrap();
        let welcome = alfa.add_member(&bravo.key_package().unwrap()).unwrap();
        bravo.join(&welcome).unwrap();

        let key = alfa.voice_key().unwrap();
        assert_eq!(key.len(), 32);
        assert_eq!(key, bravo.voice_key().unwrap());
        assert_eq!(alfa.epoch(), bravo.epoch());

        // Someone with their own group gets an unrelated key.
        outsider.create_group().unwrap();
        assert_ne!(key, outsider.voice_key().unwrap());
    }

    #[test]
    fn adding_a_member_changes_the_key() {
        let mut alfa = Member::new("alfa").unwrap();
        let mut bravo = Member::new("bravo").unwrap();
        alfa.create_group().unwrap();
        let before = alfa.voice_key().unwrap();

        let welcome = alfa.add_member(&bravo.key_package().unwrap()).unwrap();
        bravo.join(&welcome).unwrap();

        assert_ne!(before, alfa.voice_key().unwrap(), "new epoch, new key");
    }
}

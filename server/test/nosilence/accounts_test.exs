# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.AccountsTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures

  alias Nosilence.Accounts
  alias Nosilence.Accounts.{User, UserToken}

  describe "register_user/1" do
    test "creates an unconfirmed user with a hashed password and sends a confirmation link" do
      attrs = valid_attrs(%{"email" => "  Burak@Example.com "})
      assert {:ok, user} = Accounts.register_user(attrs)

      assert user.email == "Burak@Example.com"
      assert user.confirmed_at == nil
      assert %DateTime{} = user.age_confirmed_at
      assert "$argon2id$" <> _ = user.hashed_password
      refute user.password
      assert is_binary(token_from_email("Burak@Example.com"))
    end

    test "never stores the birth date or the plain password" do
      user = user_fixture()
      fields = User.__schema__(:fields)
      refute :birth_date in fields
      refute :password in fields
      assert Repo.reload!(user).hashed_password != valid_password()
    end

    test "requires confirming 18+" do
      assert {:error, cs} = Accounts.register_user(valid_attrs(%{"age_confirmed" => false}))
      assert %{age_confirmed: ["you must be 18 or older"]} = errors_on(cs)

      assert {:error, cs} = Accounts.register_user(Map.delete(valid_attrs(), "age_confirmed"))
      assert %{age_confirmed: _} = errors_on(cs)
    end

    test "rejects short passwords" do
      assert {:error, cs} = Accounts.register_user(valid_attrs(%{"password" => "short"}))
      assert %{password: ["should be at least 12 character(s)"]} = errors_on(cs)
    end

    test "rejects invalid emails, including oversized domain labels" do
      for email <- ["no-at-sign", "a@b", "a b@c.com", "a@" <> String.duplicate("x", 64) <> ".com"] do
        assert {:error, cs} = Accounts.register_user(valid_attrs(%{"email" => email})),
               "accepted #{email}"

        assert %{email: _} = errors_on(cs)
      end
    end

    test "emails are unique regardless of case" do
      user_fixture(%{"email" => "same@example.com"})
      assert {:error, cs} = Accounts.register_user(valid_attrs(%{"email" => "SAME@example.com"}))
      assert %{email: ["has already been taken"]} = errors_on(cs)
    end

    test "rejects invisible formatting characters in display names" do
      name = "Bu" <> <<0x202E::utf8>> <> "rak"
      assert {:error, cs} = Accounts.register_user(valid_attrs(%{"display_name" => name}))
      assert %{display_name: ["has invalid characters"]} = errors_on(cs)
    end
  end

  describe "confirm_user/1" do
    test "confirms with the emailed token, once" do
      user = user_fixture()
      token = token_from_email(user.email)

      assert {:ok, confirmed} = Accounts.confirm_user(token)
      assert confirmed.confirmed_at
      assert {:error, :invalid_token} = Accounts.confirm_user(token)
    end

    test "rejects garbage and session tokens" do
      user = confirmed_user_fixture()
      assert {:error, :invalid_token} = Accounts.confirm_user("not-a-token")
      assert {:error, :invalid_token} = Accounts.confirm_user(Accounts.create_session(user))
    end

    test "rejects expired tokens" do
      user = user_fixture()
      token = token_from_email(user.email)
      expire_tokens(user, days: 8)
      assert {:error, :invalid_token} = Accounts.confirm_user(token)
    end
  end

  describe "authenticate/2" do
    test "accepts the right password of a confirmed user" do
      user = confirmed_user_fixture()
      assert {:ok, %User{id: id}} = Accounts.authenticate(user.email, valid_password())
      assert id == user.id
    end

    test "is case-insensitive for the email" do
      user = confirmed_user_fixture(%{"email" => "mixed@example.com"})
      assert {:ok, _} = Accounts.authenticate("MIXED@example.com", valid_password())
      assert user
    end

    test "gives the same error for a wrong password and an unknown email" do
      user = confirmed_user_fixture()
      assert {:error, :invalid_credentials} = Accounts.authenticate(user.email, "wrong password!")
      assert {:error, :invalid_credentials} = Accounts.authenticate("nobody@example.com", "x")
    end

    test "refuses unconfirmed accounts" do
      user = user_fixture()
      assert {:error, :unconfirmed} = Accounts.authenticate(user.email, valid_password())
    end
  end

  describe "sessions" do
    test "a session token resolves to its user until deleted" do
      user = confirmed_user_fixture()
      token = Accounts.create_session(user)

      assert Accounts.get_user_by_session(token).id == user.id
      :ok = Accounts.delete_session(token)
      refute Accounts.get_user_by_session(token)
    end

    test "only the hash is stored" do
      user = confirmed_user_fixture()
      token = Accounts.create_session(user)

      [row] =
        Repo.all(from t in UserToken, where: t.user_id == ^user.id and t.context == "session")

      {:ok, raw} = Base.url_decode64(token, padding: false)
      refute row.token_hash == raw
      assert row.token_hash == :crypto.hash(:sha256, raw)
    end

    test "sessions expire after 60 days" do
      user = confirmed_user_fixture()
      token = Accounts.create_session(user)
      expire_tokens(user, days: 61)
      refute Accounts.get_user_by_session(token)
    end

    test "malformed tokens are ignored" do
      refute Accounts.get_user_by_session("!!!")
      refute Accounts.get_user_by_session(nil)
    end
  end

  describe "password reset" do
    test "sets a new password and signs out every session" do
      user = confirmed_user_fixture()
      session = Accounts.create_session(user)

      :ok = Accounts.request_password_reset(user.email)
      token = token_from_email(user.email)

      assert {:ok, _} = Accounts.reset_password(token, %{"password" => "a brand new passphrase"})
      refute Accounts.get_user_by_session(session)
      assert {:ok, _} = Accounts.authenticate(user.email, "a brand new passphrase")

      assert {:error, :invalid_token} =
               Accounts.reset_password(token, %{"password" => "another one here"})
    end

    test "unknown emails get the same answer and no email" do
      assert :ok = Accounts.request_password_reset("nobody@example.com")
      refute_received {:email, _}
    end

    test "reset links expire after an hour" do
      user = confirmed_user_fixture()
      :ok = Accounts.request_password_reset(user.email)
      token = token_from_email(user.email)
      expire_tokens(user, hours: 2)

      assert {:error, :invalid_token} =
               Accounts.reset_password(token, %{"password" => "a brand new passphrase"})
    end

    test "validates the new password" do
      user = confirmed_user_fixture()
      :ok = Accounts.request_password_reset(user.email)
      token = token_from_email(user.email)

      assert {:error, %Ecto.Changeset{}} =
               Accounts.reset_password(token, %{"password" => "short"})
    end

    test "confirms an unconfirmed account, since the user proved they own the email" do
      user = user_fixture()
      _confirmation = token_from_email(user.email)
      :ok = Accounts.request_password_reset(user.email)
      token = token_from_email(user.email)

      assert {:ok, reset} =
               Accounts.reset_password(token, %{"password" => "a brand new passphrase"})

      assert reset.confirmed_at
    end
  end

  test "resend_confirmation/1 only emails unconfirmed accounts" do
    user = user_fixture()
    _first = token_from_email(user.email)
    :ok = Accounts.resend_confirmation(user.email)
    assert token_from_email(user.email)

    confirmed = confirmed_user_fixture()
    :ok = Accounts.resend_confirmation(confirmed.email)
    refute_received {:email, %{to: [{_, _}]}}
  end

  defp expire_tokens(user, shift) do
    seconds = Keyword.get(shift, :days, 0) * 86_400 + Keyword.get(shift, :hours, 0) * 3_600
    past = DateTime.add(DateTime.utc_now(:second), -seconds, :second)
    Repo.update_all(from(t in UserToken, where: t.user_id == ^user.id), set: [inserted_at: past])
  end
end

# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.AccountsGoogleTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures

  alias Nosilence.Accounts

  defp identity(attrs \\ %{}),
    do:
      Map.merge(
        %{sub: "sub-#{System.unique_integer([:positive])}", email: unique_email(), name: "G"},
        attrs
      )

  test "a new Google identity must finish sign-up first" do
    id = identity()
    assert {:new, ^id} = Accounts.sign_in_with_google(id)
  end

  test "register_google_user/2 creates a confirmed account without a password" do
    id = identity()

    assert {:ok, user} =
             Accounts.register_google_user(id, %{
               "display_name" => "Burak",
               "age_confirmed" => true
             })

    assert user.google_sub == id.sub
    assert user.email == id.email
    assert user.confirmed_at
    assert user.age_confirmed_at
    assert user.hashed_password == nil
    # No password means password sign-in never works for this account.
    assert {:error, :invalid_credentials} = Accounts.authenticate(id.email, "")
    assert {:ok, %{id: same}} = Accounts.sign_in_with_google(id)
    assert same == user.id
  end

  test "register_google_user/2 still requires 18+ and a display name" do
    assert {:error, cs} = Accounts.register_google_user(identity(), %{"display_name" => ""})
    assert %{age_confirmed: _, display_name: _} = errors_on(cs)
  end

  test "register_google_user/2 ignores attempts to override the email or Google id" do
    id = identity()

    {:ok, user} =
      Accounts.register_google_user(id, %{
        "display_name" => "B",
        "age_confirmed" => true,
        "email" => "attacker@example.com",
        "google_sub" => "attacker"
      })

    assert user.email == id.email
    assert user.google_sub == id.sub
  end

  test "links Google to a confirmed account with the same email and keeps its password" do
    user = confirmed_user_fixture()
    id = identity(%{email: String.upcase(user.email)})

    assert {:ok, linked} = Accounts.sign_in_with_google(id)
    assert linked.id == user.id
    assert linked.google_sub == id.sub
    assert {:ok, _} = Accounts.authenticate(user.email, valid_password())
  end

  test "linking an unconfirmed account removes the password set by someone else" do
    # An attacker registers the victim's email first and never confirms it...
    squatter = user_fixture(%{"email" => "victim@example.com"})
    _unused_link = token_from_email(squatter.email)

    # ...then the real owner signs in with Google.
    assert {:ok, linked} = Accounts.sign_in_with_google(identity(%{email: "victim@example.com"}))

    assert linked.id == squatter.id
    assert linked.confirmed_at
    assert linked.hashed_password == nil

    assert {:error, :invalid_credentials} =
             Accounts.authenticate("victim@example.com", valid_password())
  end
end

# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.AccountsFixtures do
  @moduledoc "Test helpers for accounts."

  alias Nosilence.Accounts

  def unique_email, do: "user#{System.unique_integer([:positive])}@example.com"
  def valid_password, do: "correct horse battery"

  def valid_attrs(attrs \\ %{}) do
    Enum.into(attrs, %{
      "email" => unique_email(),
      "display_name" => "Burak",
      "password" => valid_password(),
      "age_confirmed" => true
    })
  end

  @doc "A registered but unconfirmed user."
  def user_fixture(attrs \\ %{}) do
    {:ok, user} = attrs |> valid_attrs() |> Accounts.register_user()
    user
  end

  @doc "A registered user who has confirmed their email."
  # Confirms through the emailed link, like a real user, which also consumes that email.
  def confirmed_user_fixture(attrs \\ %{}) do
    user = user_fixture(attrs)
    {:ok, user} = user.email |> token_from_email() |> Accounts.confirm_user()
    user
  end

  @doc """
  Takes the next email sent to `email` (the Swoosh test adapter delivers it as a
  message to the test process) and returns the token in its link.
  """
  def token_from_email(email) do
    receive do
      {:email, %Swoosh.Email{to: [{_, ^email}], text_body: body}} ->
        [_, token] = Regex.run(~r/token=([A-Za-z0-9_-]+)/, body)
        token
    after
      1_000 -> raise "no email for #{email}"
    end
  end
end

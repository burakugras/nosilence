# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Accounts.UserNotifier do
  @moduledoc """
  Account emails. In development they land in the local mailbox at
  http://127.0.0.1:4000/dev/mailbox instead of being sent.
  """
  import Swoosh.Email

  alias Nosilence.Mailer

  @from {"Nosilence", "no-reply@nosilence.local"}

  def deliver_confirmation(user, url) do
    deliver(user.email, "Confirm your Nosilence account", """
    Hi #{user.display_name},

    Confirm your email address to finish creating your account:

    #{url}

    The link works once and expires in 7 days. If you did not sign up, ignore this email.
    """)
  end

  def deliver_password_reset(user, url) do
    deliver(user.email, "Reset your Nosilence password", """
    Hi #{user.display_name},

    Set a new password with this link:

    #{url}

    The link works once and expires in 1 hour. Resetting signs you out on all devices.
    If you did not ask for this, ignore this email; your password stays the same.
    """)
  end

  def deliver_ownership_offer(user, community, deadline) do
    url = Application.fetch_env!(:nosilence, :app_url) <> "/c/" <> community.id

    deliver(user.email, "You are offered ownership of #{community.name}", """
    Hi #{user.display_name},

    You have been offered ownership of the community "#{community.name}" on Nosilence.
    Accept or decline it in the app before #{Calendar.strftime(deadline, "%Y-%m-%d %H:%M")} UTC:

    #{url}

    If you do not answer by then, the next person on the list is asked.
    """)
  end

  defp deliver(to, subject, body) do
    email =
      new()
      |> to(to)
      |> from(@from)
      |> subject(subject)
      |> text_body(body)

    with {:ok, _meta} <- Mailer.deliver(email), do: {:ok, email}
  end
end

# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.TrafficLog do
  @moduledoc """
  Traffic records the law requires a service like ours to keep (ADR 0009):
  account, event (sign-in, connection), time, and the IP address and port it
  came from. Never message or audio content.

  The address is encrypted with AES-256-GCM using a key from the server's
  configuration, not from the database, so a database dump or backup alone
  does not reveal it. User id and event are bound to the ciphertext (AAD), so
  an encrypted address cannot be moved to another row. Records are kept for
  `retention_days` (default 365) and then deleted by `Nosilence.Retention`;
  they are kept when an account is deleted.
  """
  use Ecto.Schema
  import Ecto.Query

  alias Nosilence.Repo

  @primary_key {:id, :binary_id, autogenerate: true}

  schema "traffic_logs" do
    field :user_id, :binary_id
    field :event, :string
    field :encrypted_address, :binary
    field :inserted_at, :utc_datetime
  end

  @events ~w(sign_in connect)

  @doc "Records `event` for `user_id` from `{ip_tuple, port}`."
  def record(user_id, event, {ip, port}) when event in @events do
    address = "#{:inet.ntoa(ip)} #{port}"

    Repo.insert!(
      %__MODULE__{
        user_id: user_id,
        event: event,
        encrypted_address: encrypt(address, aad(user_id, event)),
        inserted_at: DateTime.utc_now(:second)
      },
      # Keep even the ciphertext out of the query log.
      log: false
    )

    :ok
  end

  @doc "A user's own records, decrypted (for their data export)."
  def for_user(user_id) do
    Repo.all(from t in __MODULE__, where: t.user_id == ^user_id, order_by: t.inserted_at)
    |> Enum.map(fn t ->
      %{
        event: t.event,
        at: t.inserted_at,
        address: decrypt(t.encrypted_address, aad(t.user_id, t.event))
      }
    end)
  end

  @doc "Deletes records older than the retention period. Returns how many."
  def delete_expired do
    cutoff = DateTime.add(DateTime.utc_now(), -config(:retention_days), :day)
    {count, _} = Repo.delete_all(from t in __MODULE__, where: t.inserted_at < ^cutoff)
    count
  end

  defp aad(user_id, event), do: "nosilence traffic log|#{user_id}|#{event}"

  defp encrypt(plaintext, aad) do
    iv = :crypto.strong_rand_bytes(12)

    {ciphertext, tag} =
      :crypto.crypto_one_time_aead(:aes_256_gcm, key(), iv, plaintext, aad, true)

    iv <> tag <> ciphertext
  end

  defp decrypt(<<iv::binary-12, tag::binary-16, ciphertext::binary>>, aad) do
    case :crypto.crypto_one_time_aead(:aes_256_gcm, key(), iv, ciphertext, aad, tag, false) do
      :error -> nil
      plaintext -> plaintext
    end
  end

  defp key do
    case Base.decode64(config(:key)) do
      {:ok, key} when byte_size(key) == 32 -> key
      _ -> raise "Nosilence.TrafficLog :key must be 32 bytes, base64-encoded"
    end
  end

  defp config(name),
    do: Application.fetch_env!(:nosilence, __MODULE__) |> Keyword.fetch!(name)
end

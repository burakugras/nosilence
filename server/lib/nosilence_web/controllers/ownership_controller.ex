# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.OwnershipController do
  use NosilenceWeb, :controller

  alias Nosilence.Communities.Succession

  action_fallback NosilenceWeb.FallbackController

  def show(conn, %{"id" => id}) do
    with {:ok, t, available_at} <- Succession.current(conn.assigns.current_user, id),
         do: json(conn, %{transfer: transfer_json(t), handover_available_at: available_at})
  end

  def offer(conn, %{"id" => id} = params) do
    with {:ok, t} <- Succession.offer(conn.assigns.current_user, id, params["candidates"]),
         do: json(conn, %{transfer: transfer_json(t)})
  end

  def cancel(conn, %{"id" => id}) do
    with :ok <- Succession.cancel(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def offers(conn, _params),
    do: json(conn, %{offers: Succession.offers_for(conn.assigns.current_user)})

  def accept(conn, %{"transfer_id" => id}) do
    with :ok <- Succession.accept(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  def decline(conn, %{"transfer_id" => id}) do
    with :ok <- Succession.decline(conn.assigns.current_user, id),
         do: send_resp(conn, :no_content, "")
  end

  defp transfer_json(nil), do: nil

  defp transfer_json(t) do
    %{
      id: t.id,
      kind: t.kind,
      status: t.status,
      candidates: t.candidates,
      current: t.current,
      deadline: t.deadline,
      delete_at: t.delete_at
    }
  end
end

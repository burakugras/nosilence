# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.ProfileController do
  @moduledoc "Profile picture and status (ADR 0017)."
  use NosilenceWeb, :controller

  alias Nosilence.Profiles
  alias NosilenceWeb.UserJSON

  action_fallback NosilenceWeb.FallbackController

  @doc "Body: `{\"image\": <Base64 WebP>}`."
  def set_avatar(conn, %{"image" => image}) when is_binary(image) do
    # Base64 is a third larger: refuse an oversized body before decoding it.
    with true <-
           byte_size(image) <= div(Profiles.max_avatar_bytes() * 4, 3) + 4 ||
             {:error, :image_too_large},
         {:ok, bytes} <- decode(image),
         {:ok, user} <- Profiles.set_avatar(conn.assigns.current_user, bytes),
         do: json(conn, %{user: UserJSON.user(user)})
  end

  def set_avatar(_conn, _params), do: {:error, :invalid_image}

  def remove_avatar(conn, _params) do
    {:ok, user} = Profiles.remove_avatar(conn.assigns.current_user)
    json(conn, %{user: UserJSON.user(user)})
  end

  def set_status(conn, params) do
    with {:ok, user} <- Profiles.set_status(conn.assigns.current_user, params),
         do: json(conn, %{user: UserJSON.user(user)})
  end

  @doc """
  The picture as an image. The address carries the version (`?v=`), so it can be
  kept for long; private, because only some people may see it.
  """
  def avatar(conn, %{"user_id" => user_id}) do
    with {:ok, image} <- Profiles.get_avatar(conn.assigns.current_user, user_id) do
      conn
      |> put_resp_content_type("image/webp", nil)
      |> put_resp_header("cache-control", "private, max-age=31536000, immutable")
      |> put_resp_header("x-content-type-options", "nosniff")
      |> put_resp_header("content-security-policy", "default-src 'none'; sandbox")
      |> send_resp(200, image)
    end
  end

  defp decode(image) do
    case Base.decode64(image) do
      {:ok, bytes} -> {:ok, bytes}
      :error -> {:error, :invalid_image}
    end
  end
end

# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.ProfilesTest do
  use Nosilence.DataCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures
  import Nosilence.WebpFixtures

  alias Nosilence.{Profiles, Social}
  alias Nosilence.Profiles.Webp

  defp named(name) do
    user = confirmed_user_fixture(%{"display_name" => String.capitalize(name)})
    {:ok, user} = Social.set_username(user, name)
    user
  end

  describe "WebP headers" do
    test "reads the size of lossless, lossy and extended images" do
      assert {:ok, {256, 128}} = Webp.dimensions(lossless(256, 128))
      assert {:ok, {40, 30}} = Webp.dimensions(lossy(40, 30))
      assert {:error, :animated} = Webp.dimensions(animated())
    end

    test "anything else is not WebP" do
      assert {:error, :not_webp} = Webp.dimensions(<<0x89, "PNG\r\n", 0x1A, "\n", 0::64>>)
      assert {:error, :not_webp} = Webp.dimensions("RIFF")
      # The RIFF size must match the bytes.
      assert {:error, :not_webp} = Webp.dimensions(lossless() <> "extra")
      assert {:error, :not_webp} = Webp.dimensions(webp(<<"ABCD", 0::64>>))
    end
  end

  describe "profile picture" do
    test "a still WebP up to 256×256 is stored; each new one gets a new version" do
      user = confirmed_user_fixture()
      assert {:ok, %{avatar_version: 1} = user} = Profiles.set_avatar(user, lossless())
      assert {:ok, %{avatar_version: 2} = user} = Profiles.set_avatar(user, lossy(64, 64))
      assert {:ok, image} = Profiles.get_avatar(user, user.id)
      assert image == lossy(64, 64)

      assert {:ok, %{avatar_version: nil} = user} = Profiles.remove_avatar(user)
      assert {:error, :not_found} = Profiles.get_avatar(user, user.id)
    end

    test "other pictures and other files are refused" do
      user = confirmed_user_fixture()
      assert {:error, :invalid_image} = Profiles.set_avatar(user, lossless(257, 256))
      assert {:error, :invalid_image} = Profiles.set_avatar(user, lossless(8, 8))
      assert {:error, :invalid_image} = Profiles.set_avatar(user, animated())
      assert {:error, :invalid_image} = Profiles.set_avatar(user, "<svg onload=alert(1)>")

      big =
        webp(
          <<"VP8L", 5::little-32, 0x2F, 255 + 255 * 16_384::little-32, 0::size(256 * 1024 * 8)>>
        )

      assert {:error, :image_too_large} = Profiles.set_avatar(user, big)
    end

    test "only friends and people who share a community or a conversation see it" do
      [ayse, cem, deniz, stranger] = Enum.map(~w(ayse cem deniz eda), &named/1)
      {:ok, _} = Profiles.set_avatar(ayse, lossless())

      assert {:error, :not_found} = Profiles.get_avatar(stranger, ayse.id)
      # Unknown and invalid ids answer the same.
      assert {:error, :not_found} = Profiles.get_avatar(stranger, Ecto.UUID.generate())
      assert {:error, :not_found} = Profiles.get_avatar(stranger, "nope")

      # A community.
      %{community: c} = community_fixture(ayse)
      :ok = join_fixture(ayse, c, deniz)
      assert {:ok, _} = Profiles.get_avatar(deniz, ayse.id)

      # Friends, then a conversation that outlives the friendship.
      {:ok, :requested} = Social.request_friend(ayse, "cem")
      :ok = Social.accept_friend(cem, ayse.id)
      assert {:ok, _} = Profiles.get_avatar(cem, ayse.id)
      {:ok, _} = Social.open_direct(cem, ayse.id)
      :ok = Social.remove_friend(cem, ayse.id)
      assert {:ok, _} = Profiles.get_avatar(cem, ayse.id)
    end
  end

  describe "status" do
    test "a choice and a short text with an optional end" do
      user = confirmed_user_fixture()
      later = DateTime.utc_now() |> DateTime.add(3600) |> DateTime.truncate(:second)

      assert {:ok, user} =
               Profiles.set_status(user, %{
                 "status" => "dnd",
                 "text" => "  In a match  ",
                 "expires_at" => DateTime.to_iso8601(later)
               })

      assert %{status: "dnd", status_text: "In a match", status_expires_at: ^later} = user
      assert Profiles.status_text(user) == "In a match"

      # Without a text there is no end either.
      assert {:ok, %{status: "invisible", status_text: nil, status_expires_at: nil}} =
               Profiles.set_status(user, %{
                 "status" => "invisible",
                 "text" => "",
                 "expires_at" => DateTime.to_iso8601(later)
               })
    end

    test "an ended text is no longer shown" do
      user = %Nosilence.Accounts.User{
        status_text: "Away",
        status_expires_at: DateTime.add(DateTime.utc_now(), -1)
      }

      assert Profiles.status_text(user) == nil
      assert %{status_text: nil, status_expires_at: nil} = Profiles.presence_fields(user)
    end

    test "checks the choice, the text and the end" do
      user = confirmed_user_fixture()
      past = DateTime.utc_now() |> DateTime.add(-60) |> DateTime.to_iso8601()
      far = DateTime.utc_now() |> DateTime.add(31 * 86_400) |> DateTime.to_iso8601()

      assert {:error, cs} = Profiles.set_status(user, %{"status" => "away"})
      assert errors_on(cs).status != []

      assert {:error, cs} =
               Profiles.set_status(user, %{
                 "status" => "online",
                 "text" => String.duplicate("a", 61)
               })

      assert errors_on(cs).status_text != []

      assert {:error, cs} =
               Profiles.set_status(user, %{"status" => "online", "text" => "a\u202Eb"})

      assert "contains characters that are not allowed" in errors_on(cs).status_text

      for at <- [past, far] do
        assert {:error, cs} =
                 Profiles.set_status(user, %{
                   "status" => "online",
                   "text" => "x",
                   "expires_at" => at
                 })

        assert errors_on(cs).status_expires_at != []
      end
    end
  end
end

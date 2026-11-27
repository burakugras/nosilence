# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.ProfileControllerTest do
  use NosilenceWeb.ConnCase, async: true

  import Nosilence.AccountsFixtures
  import Nosilence.CommunitiesFixtures
  import Nosilence.WebpFixtures

  alias Nosilence.Accounts

  defp authed(user) do
    build_conn()
    |> put_req_header("content-type", "application/json")
    |> put_req_cookie(NosilenceWeb.UserAuth.cookie_name(), Accounts.create_session(user))
  end

  setup do
    owner = confirmed_user_fixture(%{"display_name" => "Owner"})
    member = confirmed_user_fixture(%{"display_name" => "Member"})
    fixture = community_fixture(owner)
    :ok = join_fixture(owner, fixture.community, member)
    Map.merge(fixture, %{owner: owner, member: member})
  end

  test "upload, serve and remove a profile picture", ctx do
    image = lossless(128, 128)

    assert %{"user" => %{"avatar" => 1}} =
             authed(ctx.owner)
             |> put(~p"/api/me/avatar", %{image: Base.encode64(image)})
             |> json_response(200)

    conn = authed(ctx.member) |> get(~p"/api/users/#{ctx.owner.id}/avatar?v=1")
    assert response(conn, 200) == image
    assert get_resp_header(conn, "content-type") == ["image/webp"]
    assert get_resp_header(conn, "x-content-type-options") == ["nosniff"]
    assert ["default-src 'none'; sandbox"] = get_resp_header(conn, "content-security-policy")
    assert ["private, " <> _] = get_resp_header(conn, "cache-control")

    # Members lists and messages carry the version.
    assert %{"members" => members} =
             authed(ctx.member)
             |> get(~p"/api/communities/#{ctx.community.id}/members")
             |> json_response(200)

    assert Enum.find(members, &(&1["user_id"] == ctx.owner.id))["avatar"] == 1

    stranger = confirmed_user_fixture()
    assert authed(stranger) |> get(~p"/api/users/#{ctx.owner.id}/avatar") |> response(404)

    assert %{"user" => %{"avatar" => nil}} =
             authed(ctx.owner) |> delete(~p"/api/me/avatar") |> json_response(200)

    assert authed(ctx.member) |> get(~p"/api/users/#{ctx.owner.id}/avatar") |> response(404)
  end

  test "refuses what is not a still WebP", ctx do
    for body <- [%{image: "not base64!"}, %{image: Base.encode64("GIF89a")}, %{}, %{image: 5}] do
      assert %{"error" => "the picture must be a still WebP" <> _} =
               authed(ctx.owner) |> put(~p"/api/me/avatar", body) |> json_response(422)
    end

    huge = Base.encode64(:binary.copy("A", 300 * 1024))

    assert %{"error" => "the picture is larger than 256 KB"} =
             authed(ctx.owner) |> put(~p"/api/me/avatar", %{image: huge}) |> json_response(413)
  end

  test "status", ctx do
    assert %{"user" => %{"status" => "dnd", "status_text" => "Focus", "status_expires_at" => nil}} =
             authed(ctx.owner)
             |> put(~p"/api/me/status", %{status: "dnd", text: "Focus"})
             |> json_response(200)

    assert %{"user" => %{"status" => "dnd", "status_text" => "Focus"}} =
             authed(ctx.owner) |> get(~p"/api/me") |> json_response(200)

    assert %{"errors" => %{"status" => _}} =
             authed(ctx.owner) |> put(~p"/api/me/status", %{status: "busy"}) |> json_response(422)
  end

  test "reactions and mentions through the API", ctx do
    ch = ctx.text_channel.id

    assert %{"message" => %{"id" => id, "mentions" => [mentioned], "reactions" => []}} =
             authed(ctx.owner)
             |> post(~p"/api/channels/#{ch}/messages", %{
               text: "hi @member",
               mentions: [ctx.member.id]
             })
             |> json_response(201)

    assert mentioned == ctx.member.id

    assert authed(ctx.member)
           |> post(~p"/api/channels/#{ch}/messages", %{text: "@everyone", mention: "everyone"})
           |> json_response(403)

    # The emoji travels in the address, percent-encoded.
    assert authed(ctx.member)
           |> put("/api/messages/#{id}/reactions/#{URI.encode("👍")}")
           |> response(204)

    assert %{"messages" => [%{"reactions" => [%{"emoji" => "👍", "count" => 1, "me" => true}]}]} =
             authed(ctx.member) |> get(~p"/api/channels/#{ch}/messages") |> json_response(200)

    assert %{"error" => "invalid emoji"} =
             authed(ctx.member) |> put("/api/messages/#{id}/reactions/x") |> json_response(422)

    assert authed(ctx.member)
           |> delete("/api/messages/#{id}/reactions/#{URI.encode("👍")}")
           |> response(204)

    assert %{"messages" => [%{"reactions" => []}]} =
             authed(ctx.member) |> get(~p"/api/channels/#{ch}/messages") |> json_response(200)
  end

  test "the desktop app may use PUT and PATCH", _ctx do
    conn =
      build_conn()
      |> put_req_header("origin", "http://desktop.test")
      |> options("/api/me/status")

    assert ["GET, POST, PUT, PATCH, DELETE"] =
             get_resp_header(conn, "access-control-allow-methods")
  end

  test "notification settings, mention counts and who reacted (ADR 0018)", ctx do
    ch = ctx.text_channel.id
    c = ctx.community.id

    assert authed(ctx.member)
           |> put("/api/notification-settings/community/#{c}", %{level: "mentions"})
           |> response(204)

    assert %{"settings" => [%{"type" => "community", "level" => "mentions"}]} =
             authed(ctx.member) |> get(~p"/api/notification-settings") |> json_response(200)

    assert authed(ctx.member)
           |> delete("/api/notification-settings/community/#{c}")
           |> response(204)

    assert %{"settings" => []} =
             authed(ctx.member) |> get(~p"/api/notification-settings") |> json_response(200)

    {:ok, m} =
      Nosilence.Messaging.send_message(ctx.owner, ch, "hi @member", %{
        "mentions" => [ctx.member.id]
      })

    assert %{"communities" => [%{"unread" => 1, "mentions" => 1}]} =
             authed(ctx.member) |> get(~p"/api/communities") |> json_response(200)

    assert %{"channels" => channels} =
             authed(ctx.member) |> get(~p"/api/communities/#{c}") |> json_response(200)

    assert %{"mentions" => 1, "unread" => 1} = Enum.find(channels, &(&1["id"] == ch))

    :ok = Nosilence.Messaging.react(ctx.member, m.id, "👍", true)

    assert %{"names" => ["Member"], "total" => 1} =
             authed(ctx.owner)
             |> get("/api/messages/#{m.id}/reactions/#{URI.encode("👍")}")
             |> json_response(200)
  end
end

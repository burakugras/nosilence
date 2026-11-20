# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.Router do
  use NosilenceWeb, :router

  import NosilenceWeb.UserAuth

  pipeline :api do
    plug :accepts, ["json"]
    plug :require_json
    plug :fetch_current_user
  end

  pipeline :authenticated do
    plug :require_authenticated
  end

  # Full-page navigations to and from Google: no JSON content negotiation.
  pipeline :oauth_redirect do
    plug :fetch_current_user
  end

  scope "/api/auth/google", NosilenceWeb do
    pipe_through :oauth_redirect

    get "/", GoogleAuthController, :start
    get "/callback", GoogleAuthController, :callback
  end

  scope "/api", NosilenceWeb do
    pipe_through :api

    post "/accounts", AccountController, :register
    post "/accounts/confirm", AccountController, :confirm
    post "/accounts/confirm/resend", AccountController, :resend_confirmation
    post "/accounts/password-reset", AccountController, :request_password_reset
    post "/accounts/password-reset/confirm", AccountController, :reset_password

    post "/session", SessionController, :create
    delete "/session", SessionController, :delete

    get "/auth/providers", GoogleAuthController, :providers
    get "/auth/google/signup", GoogleAuthController, :pending
    post "/auth/google/signup", GoogleAuthController, :complete
    post "/auth/desktop/exchange", GoogleAuthController, :exchange
  end

  scope "/api", NosilenceWeb do
    pipe_through [:api, :authenticated]

    get "/me", SessionController, :show

    get "/communities", CommunityController, :index
    post "/communities", CommunityController, :create
    get "/communities/:id", CommunityController, :show
    delete "/communities/:id", CommunityController, :delete
    get "/communities/:id/members", CommunityController, :members
    delete "/communities/:id/members/:user_id", CommunityController, :remove_member
    delete "/communities/:id/membership", CommunityController, :leave
    post "/communities/:id/channels", CommunityController, :create_channel

    get "/communities/:id/invites", InviteController, :index
    post "/communities/:id/invites", InviteController, :create
    delete "/invites/:invite_id", InviteController, :revoke
    post "/invites/preview", InviteController, :preview
    post "/invites/accept", InviteController, :accept

    post "/channels/:channel_id/voice-token", VoiceController, :token

    get "/channels/:channel_id/messages", MessageController, :index
    post "/channels/:channel_id/messages", MessageController, :create
    delete "/messages/:id", MessageController, :delete

    post "/socket-token", SocketController, :create
  end

  # Enable Swoosh mailbox preview in development
  if Application.compile_env(:nosilence, :dev_routes) do
    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end

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

  # LiveKit server to server: authenticated by a signed JWT, not by a session.
  pipeline :livekit_webhook do
  end

  scope "/api/livekit", NosilenceWeb do
    pipe_through :livekit_webhook
    post "/webhook", LiveKitWebhookController, :receive
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
    post "/auth/desktop/complete-signup", GoogleAuthController, :complete_desktop
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
    patch "/communities/:id/members/:user_id", CommunityController, :set_role
    delete "/communities/:id/voice/:user_id", CommunityController, :disconnect_voice
    post "/communities/:id/channels/order", CommunityController, :reorder_channels
    get "/communities/:id/ownership", OwnershipController, :show
    post "/communities/:id/ownership", OwnershipController, :offer
    delete "/communities/:id/ownership", OwnershipController, :cancel
    get "/ownership-offers", OwnershipController, :offers
    post "/ownership-offers/:transfer_id/accept", OwnershipController, :accept
    post "/ownership-offers/:transfer_id/decline", OwnershipController, :decline
    patch "/channels/:channel_id", CommunityController, :rename_channel
    delete "/channels/:channel_id", CommunityController, :delete_channel
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
    post "/channels/:channel_id/read", MessageController, :read
    patch "/messages/:id", MessageController, :update
    delete "/messages/:id", MessageController, :delete
    put "/messages/:id/reactions/:emoji", MessageController, :add_reaction
    delete "/messages/:id/reactions/:emoji", MessageController, :remove_reaction

    # Profile picture and status (ADR 0017).
    put "/me/avatar", ProfileController, :set_avatar
    delete "/me/avatar", ProfileController, :remove_avatar
    put "/me/status", ProfileController, :set_status
    get "/users/:user_id/avatar", ProfileController, :avatar

    post "/socket-token", SocketController, :create
    post "/metrics/call", MetricsController, :report

    # People outside communities (ADR 0015).
    put "/me/username", SocialController, :set_username
    patch "/me/privacy", SocialController, :update_privacy
    get "/friends", SocialController, :friends
    post "/friends", SocialController, :request
    post "/friends/:user_id/accept", SocialController, :accept
    delete "/friends/:user_id", SocialController, :remove
    post "/blocks/:user_id", SocialController, :block
    delete "/blocks/:user_id", SocialController, :unblock

    get "/conversations", ConversationController, :index
    post "/conversations", ConversationController, :create
    patch "/conversations/:id", ConversationController, :rename
    post "/conversations/:id/members", ConversationController, :add_members
    delete "/conversations/:id/members/:user_id", ConversationController, :remove_member
    get "/conversations/:id/messages", ConversationController, :messages
    post "/conversations/:id/messages", ConversationController, :send_message
    post "/conversations/:id/read", ConversationController, :read
    patch "/conversation-messages/:message_id", ConversationController, :update_message
    delete "/conversation-messages/:message_id", ConversationController, :delete_message

    put "/conversation-messages/:message_id/reactions/:emoji",
        ConversationController,
        :add_reaction

    delete "/conversation-messages/:message_id/reactions/:emoji",
           ConversationController,
           :remove_reaction

    get "/account/deletion", PrivacyController, :deletion_preview
    delete "/account", PrivacyController, :delete
    get "/account/export", PrivacyController, :export
  end

  # Enable Swoosh mailbox preview in development
  if Application.compile_env(:nosilence, :dev_routes) do
    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end

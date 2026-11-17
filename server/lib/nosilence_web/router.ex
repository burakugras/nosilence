defmodule NosilenceWeb.Router do
  use NosilenceWeb, :router

  pipeline :api do
    plug :accepts, ["json"]
  end

  scope "/api", NosilenceWeb do
    pipe_through :api
  end

  # Phase 1 walking skeleton: unauthenticated voice tokens, never in production.
  if Application.compile_env(:nosilence, :dev_voice_tokens, false) do
    scope "/api/dev", NosilenceWeb do
      pipe_through :api

      post "/voice-token", DevVoiceController, :create
    end
  end

  # Enable Swoosh mailbox preview in development
  if Application.compile_env(:nosilence, :dev_routes) do
    scope "/dev" do
      pipe_through [:fetch_session, :protect_from_forgery]

      forward "/mailbox", Plug.Swoosh.MailboxPreview
    end
  end
end

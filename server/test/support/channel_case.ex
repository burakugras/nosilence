# SPDX-License-Identifier: AGPL-3.0-only
defmodule NosilenceWeb.ChannelCase do
  @moduledoc "Setup for gateway (Phoenix Channels) tests."
  use ExUnit.CaseTemplate

  using do
    quote do
      import Phoenix.ChannelTest
      import NosilenceWeb.ChannelCase
      @endpoint NosilenceWeb.Endpoint
    end
  end

  setup tags do
    Nosilence.DataCase.setup_sandbox(tags)
    :ok
  end
end

# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.RateLimitTest do
  use ExUnit.Case, async: true

  alias Nosilence.RateLimit

  test "allows the configured number of hits per key, then says how long to wait" do
    key = make_ref()
    assert :ok = RateLimit.hit(:test_rule, key)
    assert :ok = RateLimit.hit(:test_rule, key)
    assert :ok = RateLimit.hit(:test_rule, key)
    assert {:error, :rate_limited, ms} = RateLimit.hit(:test_rule, key)
    assert ms > 0 and ms <= 60_000

    # Other keys have their own count.
    assert :ok = RateLimit.hit(:test_rule, make_ref())
  end
end

# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.RateLimitTest do
  use ExUnit.Case, async: true

  alias Nosilence.RateLimit

  test "sliding window: the limit holds over any window, not per clock bucket" do
    key = make_ref()
    for _ <- 1..3, do: assert(:ok = RateLimit.hit(:test_plain, key))
    assert {:error, :rate_limited, ms} = RateLimit.hit(:test_plain, key)
    assert ms > 0 and ms <= 200

    # Other keys have their own count.
    assert :ok = RateLimit.hit(:test_plain, make_ref())

    # Once the oldest hits leave the window, hits are allowed again.
    Process.sleep(220)
    assert :ok = RateLimit.hit(:test_plain, key)
  end

  test "going over a limit with a penalty blocks, longer when it repeats" do
    key = make_ref()
    assert :ok = RateLimit.hit(:test_penalty, key)
    assert :ok = RateLimit.hit(:test_penalty, key)
    assert {:error, :rate_limited, 300} = RateLimit.hit(:test_penalty, key)
    # Still blocked, however often it tries.
    assert {:error, :rate_limited, ms} = RateLimit.hit(:test_penalty, key)
    assert ms in 1..300

    Process.sleep(320)
    assert :ok = RateLimit.hit(:test_penalty, key)
    assert :ok = RateLimit.hit(:test_penalty, key)
    # Second time within the repeat window: the longer penalty.
    assert {:error, :rate_limited, 900} = RateLimit.hit(:test_penalty, key)
  end
end

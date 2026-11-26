# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.WebpFixtures do
  @moduledoc "WebP headers for tests (the server reads headers only, ADR 0017)."

  def webp(chunk), do: <<"RIFF", byte_size(chunk) + 4::little-32, "WEBP", chunk::binary>>

  @doc "A lossless image of `w` × `h`."
  def lossless(w \\ 256, h \\ 256),
    do: webp(<<"VP8L", 5::little-32, 0x2F, w - 1 + (h - 1) * 16_384::little-32, 0, 0>>)

  @doc "A lossy key frame of `w` × `h`."
  def lossy(w \\ 256, h \\ 256),
    do: webp(<<"VP8 ", 10::little-32, 0x10, 0, 0, 0x9D, 0x01, 0x2A, w::little-16, h::little-16>>)

  @doc "An animated image."
  def animated(w \\ 64, h \\ 64),
    do: webp(<<"VP8X", 10::little-32, 0x02, 0, 0, 0, w - 1::little-24, h - 1::little-24>>)
end

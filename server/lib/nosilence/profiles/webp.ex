# SPDX-License-Identifier: AGPL-3.0-only
defmodule Nosilence.Profiles.Webp do
  @moduledoc """
  Checks that bytes are a single still WebP image, by reading its headers (RIFF
  container, first chunk VP8, VP8L or VP8X). The server does not decode or
  redraw pictures (ADR 0017): the app has already redrawn it, and this check makes
  sure nothing else is stored and served as an image.
  """

  import Bitwise, only: [band: 2, bsr: 2]

  @doc "`{:ok, {width, height}}` or `{:error, :not_webp | :animated}`."
  def dimensions(<<"RIFF", size::little-32, "WEBP", chunks::binary>> = bytes)
      when byte_size(bytes) == size + 8,
      do: chunk(chunks)

  def dimensions(_), do: {:error, :not_webp}

  # Lossy: a 3-byte frame tag (bit 0 clear on a key frame), the start code
  # 9D 01 2A, then width and height as 16-bit values whose low 14 bits count.
  defp chunk(
         <<"VP8 ", _size::little-32, tag, _tag_rest::binary-size(2), 0x9D, 0x01, 0x2A,
           w::little-16, h::little-16, _rest::binary>>
       )
       when band(tag, 1) == 0,
       do: {:ok, {band(w, 0x3FFF), band(h, 0x3FFF)}}

  # Lossless: signature 0x2F, then width - 1 and height - 1 in 14 bits each.
  defp chunk(<<"VP8L", _size::little-32, 0x2F, bits::little-32, _rest::binary>>),
    do: {:ok, {band(bits, 0x3FFF) + 1, band(bsr(bits, 14), 0x3FFF) + 1}}

  # Extended: flags (bit 1 is animation), 3 reserved bytes, then the canvas
  # width - 1 and height - 1 in 24 bits each.
  defp chunk(
         <<"VP8X", _size::little-32, flags, _reserved::binary-size(3), w::little-24, h::little-24,
           _rest::binary>>
       ) do
    if band(flags, 0x02) != 0, do: {:error, :animated}, else: {:ok, {w + 1, h + 1}}
  end

  defp chunk(_), do: {:error, :not_webp}
end

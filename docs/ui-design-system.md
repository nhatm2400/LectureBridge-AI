# LectureBridge Editorial Learning UI

## Direction

LectureBridge uses a restrained **Minimal Swiss + E-Ink/Paper** visual language. The interface should feel like a dependable learning workspace, not a generic AI product. Layout, typography, timestamps, and source relationships carry the hierarchy; decoration does not.

The core product story is: **missed lecture context → structured recovery → source verification**.

## Design dials

- Variance: 3/10 — consistent, quiet, grid-led.
- Motion: 2/10 — functional transitions only, 120–180ms.
- Density: 6/10 — compact enough for transcript and evidence work without feeling cramped.
- Typography: system sans for the product; system serif may appear only in controlled marketing headings.
- Shape: 6px controls, 10px surfaces, up to 14px for dialogs and the player.
- Shadows: neutral and shallow. Never use colored shadows, glow, glass, decorative gradients, or blur blobs.

## Color tokens

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#F4F2EC` | `#121614` |
| Surface | `#FCFBF7` | `#181E1B` |
| Elevated | `#FFFFFF` | `#202723` |
| Ink | `#17201D` | `#F2F0EA` |
| Muted | `#5E6964` | `#A8B0AC` |
| Border | `#D7D9D3` | `#343C38` |
| Accent | `#2E6256` | `#8ABAA8` |
| Accent hover | `#244D44` | `#A3CDBE` |
| Accent soft | `#E3ECE8` | `#263A33` |

Raw colors belong in the token layer or application icon only. Components consume semantic CSS variables.

## Interaction rules

- Every interactive target is at least 44×44px unless it is an inline source link with an equivalent padded hit area.
- Keyboard focus uses a visible 2px accent outline with a 3px offset.
- Sticky navigation is offset by page padding and `scroll-padding-top`; focused controls must not be hidden.
- Mobile navigation is a modal drawer: Escape closes it, focus moves into it, Tab stays within it, and focus returns to the trigger.
- Hover never scales or rotates UI. Information and actions cannot be hover-only.
- `prefers-reduced-motion` removes non-essential animation.
- Authentication permits paste and password managers and uses appropriate autocomplete attributes.

## Product hierarchy

1. Current lecture and playback.
2. “Tôi đã bỏ lỡ gì?” / “Phục hồi ngữ cảnh”.
3. Grounded Ask and source citations.
4. Semantic Timeline with explicit event type, timestamp, and Q→A relationships.
5. Summary, highlights, quiz, and flashcards as secondary study tools.

Statuses always combine icon or text with color. “AI suy luận” remains visible as neutral provenance metadata. Reviewer controls remain permission-gated.

## Responsive grid

- 375px: single column; player → transcript → recovery → ask → timeline/study tools.
- 768px: expanded single-column sections and two-column supporting content where safe.
- 1024px+: 8-column player and 4-column transcript, with a compact 224px application sidebar.
- 1440px: content remains bounded; line length and evidence density take priority over filling the viewport.

No surface may introduce horizontal page scrolling or nested scrolling that traps the primary content.

<script lang="ts">
  let { class: className = 'h-8 w-auto', ...restProps } = $props();
</script>

<div class="flex items-center gap-2">
  <svg
    class={className}
    viewBox="0 0 180 40"
    xmlns="http://www.w3.org/2000/svg"
    {...restProps}
  >
    <defs>
      <linearGradient id="bombGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop
          offset="0%"
          style="stop-color:hsl(263.4, 60%, 45%);stop-opacity:1"
        />
        <stop
          offset="100%"
          style="stop-color:hsl(215, 40%, 25%);stop-opacity:1"
        />
      </linearGradient>

      <radialGradient id="sparkGradient" cx="50%" cy="50%">
        <stop offset="0%" style="stop-color:#ff6b35;stop-opacity:1" />
        <stop offset="50%" style="stop-color:#ff8c42;stop-opacity:0.8" />
        <stop offset="100%" style="stop-color:#ffa500;stop-opacity:0.6" />
      </radialGradient>
    </defs>

    <!-- Bomb body (moved left, no drop shadow) -->
    <g transform="translate(5, 20)">
      <!-- Main bomb sphere -->
      <circle
        cx="12"
        cy="0"
        r="10"
        fill="url(#bombGradient)"
        stroke="hsl(215, 40%, 15%)"
        stroke-width="1"
      />

      <!-- Bomb highlight -->
      <ellipse cx="9" cy="-3" rx="3" ry="2" fill="#404040" opacity="0.6" />

      <!-- Wick going left (away from text) and longer -->
      <path
        d="M4 -9 C2 -14, -1 -8, -4 -12 C-7 -16, -10 -10, -13 -14 C-16 -18, -19 -12, -22 -15 C-25 -19, -28 -13, -30 -16"
        stroke="#666"
        stroke-width="2"
        fill="none"
        stroke-linecap="round"
        stroke-linejoin="round"
      />

      <!-- Spark/flame at end of wick -->
      <g transform="translate(-30, -16)">
        <circle cx="0" cy="0" r="2" fill="url(#sparkGradient)" />
        <path d="M0 -2 Q-1 -4 0 -5 Q1 -4 0 -2" fill="#ff4500" />
        <!-- Small sparks -->
        <circle cx="-2" cy="-1" r="0.5" fill="#ffa500" opacity="0.8" />
        <circle cx="2" cy="0" r="0.3" fill="#ff6b35" opacity="0.6" />
      </g>
    </g>

    <!-- Text with solid grey color (no gradient) -->
    <text
      x="35"
      y="17"
      font-family="system-ui, -apple-system, sans-serif"
      font-size="16"
      font-weight="700"
      fill="hsl(217.9, 10.6%, 70%)"
      letter-spacing="1px"
    >
      Bombastic
    </text>

    <!-- Limited text with solid grey color -->
    <text
      x="35"
      y="32"
      font-family="system-ui, -apple-system, sans-serif"
      font-size="9"
      font-weight="600"
      fill="hsl(217.9, 10.6%, 60%)"
      letter-spacing="1.5px"
    >
      LIMITED
    </text>
  </svg>
</div>

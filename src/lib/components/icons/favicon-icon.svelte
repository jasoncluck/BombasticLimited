<script lang="ts">
  let { class: className = 'h-4 w-4', ...props } = $props();
  const randomId = Math.random().toString(36).substr(2, 9);
</script>

<svg
  width="32"
  height="32"
  viewBox="0 0 32 32"
  xmlns="http://www.w3.org/2000/svg"
  class={className}
  {...props}
>
  <defs>
    <linearGradient
      id="purpleGradient-{randomId}"
      x1="0%"
      y1="0%"
      x2="100%"
      y2="100%"
    >
      <stop offset="0%" style="stop-color:hsl(263.4 70% 55%);stop-opacity:1" />
      <stop
        offset="100%"
        style="stop-color:hsl(263.4 70% 45%);stop-opacity:1"
      />
    </linearGradient>

    <filter
      id="dropShadow-{randomId}"
      x="-50%"
      y="-50%"
      width="200%"
      height="200%"
    >
      <feDropShadow
        dx="0"
        dy="1"
        stdDeviation="2"
        flood-color="rgba(0,0,0,0.3)"
      />
    </filter>
  </defs>

  <!-- Extra large B that nearly fills the entire favicon -->
  <text
    x="16"
    y="26"
    font-family="system-ui,-apple-system,sans-serif"
    font-size="32"
    font-weight="900"
    text-anchor="middle"
    fill="url(#purpleGradient-{randomId})"
    filter="url(#dropShadow-{randomId})">B</text
  >
</svg>

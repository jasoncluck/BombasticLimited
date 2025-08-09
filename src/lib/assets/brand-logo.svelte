<script lang="ts">
  let { class: className = 'h-8 w-auto', ...restProps } = $props();
  // Width guess for "Bomb" in this font/size; tweak if needed.
  const bombWidth = 36; // adjust if clipping too short/long
</script>

<div class="flex items-center gap-2">
  <svg
    class={className}
    viewBox="0 0 180 40"
    xmlns="http://www.w3.org/2000/svg"
    {...restProps}
  >
    <defs>
      <clipPath id="clip-bomb-part">
        <!-- x and width tuned so only "Bomb" is covered.
             Start x matches the text's x. -->
        <rect x="2" y="8" width={bombWidth} height="18" />
      </clipPath>
    </defs>

    <!-- Full word in purple -->
    <text
      id="brandWord"
      x="2"
      y="22"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="16"
      font-weight="700"
      kerning="normal"
      letter-spacing="0"
      fill="hsl(263.4 70% 50.4%)">Bombastic</text
    >

    <!-- Grey overlay clipped to first portion -->
    <text
      x="2"
      y="22"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="16"
      font-weight="700"
      kerning="normal"
      letter-spacing="0"
      fill="hsl(217.9 10.6% 60%)"
      clip-path="url(#clip-bomb-part)">Bombastic</text
    >

    <text
      x="42"
      y="34"
      font-family="system-ui,-apple-system,sans-serif"
      font-size="9"
      font-weight="600"
      letter-spacing="1.5px"
      text-anchor="middle"
      fill="hsl(217.9 10.6% 60%)">LIMITED</text
    >
  </svg>
</div>

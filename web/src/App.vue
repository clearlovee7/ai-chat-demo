<template>
  <RouterView />
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<style lang="scss">
:root {
  --bg: #080a0f;
  --surface: #0e1219;
  --surface-2: #141922;
  --surface-3: #1b212c;

  --line: #232a37;
  --line-2: #2f3846;

  --text: #e7ecf3;
  --text-2: #96a1b4;
  --text-3: #5d687a;

  --accent: #ffb454;
  --accent-2: #ffcb7d;
  --accent-dim: rgba(255, 180, 84, .13);
  --accent-line: rgba(255, 180, 84, .32);
  --accent-glow: rgba(255, 180, 84, .22);

  --ok: #4ade80;
  --danger: #ff6b6b;

  --el-color-primary: #ffb454;
  --el-color-primary-light-3: #c98a3f;
  --el-color-primary-light-5: #8a5f2a;
  --el-color-primary-light-7: #4a3418;
  --el-color-primary-light-8: #33240f;
  --el-color-primary-light-9: #1f1608;
  --el-color-primary-dark-2: #ffcb7d;

  --font-mono: 'JetBrains Mono Variable', ui-monospace, SFMono-Regular, Consolas, monospace;
  --font-sans: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
</style>

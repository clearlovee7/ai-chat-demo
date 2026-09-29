<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <!-- 根组件只渲染路由，页面是什么由路由表决定 -->
  <RouterView />
</template>

<style lang="scss">
/* ---------- 色板 ----------
   :root 就是 <html>，定义在这里的变量全站可用 */

:root {
  --primary: #409eff;
  --primary-hover: #2f8ee5;
  --text-main: #1f2937;
  --text-body: #26303d;
  --text-muted: #6b7684;
  --text-hint: #9aa4b2;
  --border: #eef0f4;
  --border-input: #e2e6ee;
  --bg-hover: #f4f6fa;
  --bg-panel: #fbfbfd;
}

/* ---------- 全局基础 ---------- */
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
</style>

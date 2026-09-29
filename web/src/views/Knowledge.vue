<template>
  <div class="knowledge-page">
    <AppHeader />

    <main class="knowledge-main">知识库页 · 上传界面下一步做</main>
  </div>
</template>

<script setup lang="ts">
import AppHeader from '@/components/Header.vue'
</script>

<style lang="scss">
.knowledge-page {
  width: 100%;
  max-width: 760px;
  height: 100%;
  max-height: 860px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, .08);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.knowledge-main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-hint);
  font-size: 13px;
}
</style>

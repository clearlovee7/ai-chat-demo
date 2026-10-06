<template>
  <div class="knowledge-page">
    <SideNav />

    <div class="knowledge-main">
      <header class="page-top">
        <div class="top-info">
          <h2 class="top-title">知识库</h2>
          <span class="top-meta">未接入</span>
        </div>
      </header>

      <div class="page-body">
        <div class="placeholder">
          <div class="placeholder-mark">◇</div>
          <p class="placeholder-title">知识库管理</p>
          <p class="placeholder-tip">上传界面下一步做</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import SideNav from '@/components/SideNav.vue'
</script>

<style lang="scss">
.knowledge-page {
  width: 100%;
  height: 100vh;
  background: var(--bg);
  display: flex;
  overflow: hidden;
}

.knowledge-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.page-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  height: 54px;
  padding: 0 24px;
  border-bottom: 1px solid var(--line);
  flex-shrink: 0;
}

.top-info {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.top-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: .01em;
}

.top-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.page-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.placeholder {
  text-align: center;
}

.placeholder-mark {
  font-size: 28px;
  line-height: 1;
  color: var(--text-3);
  margin-bottom: 16px;
}

.placeholder-title {
  font-size: 14px;
  color: var(--text-2);
  margin-bottom: 9px;
}

.placeholder-tip {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}
</style>

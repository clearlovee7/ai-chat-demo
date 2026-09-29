<template>
  <header class="header">
    <span class="dot"></span>
    <h1>AI 流式对话</h1>

    <nav class="nav">
      <RouterLink to="/">对话</RouterLink>
      <RouterLink to="/knowledge">知识库</RouterLink>
    </nav>

    <span class="tag">SSE 流式输出</span>
  </header>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router'

</script>

<style lang="scss">
.header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #34c759;
  box-shadow: 0 0 0 3px rgba(52, 199, 89, .15);
}

.header h1 {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
}

.nav {
  display: flex;
  gap: 4px;
  margin-left: auto;

  a {
    padding: 4px 12px;
    border-radius: 7px;
    font-size: 12.5px;
    color: var(--text-muted);
    text-decoration: none;

    &:hover {
      background: var(--bg-hover);
    }

    &.router-link-exact-active {
      background: #eef5ff;
      color: var(--primary);
      font-weight: 500;
    }
  }
}

.header .tag {
  margin-left: 10px;
  font-size: 12px;
  color: var(--text-hint);
}
</style>

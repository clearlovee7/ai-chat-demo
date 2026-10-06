<template>
  <aside class="side-nav">
    <div class="brand">
      <span class="brand-dot"></span>
      <div class="brand-text">
        <span class="brand-name">RAG Chat</span>
        <span class="brand-sub">知识库助手</span>
      </div>
    </div>

    <el-menu :default-active="route.path" router class="side-menu">
      <el-menu-item index="/">
        <el-icon><ChatDotRound /></el-icon>
        <span>对话</span>
      </el-menu-item>
      <el-menu-item index="/knowledge">
        <el-icon><Folder /></el-icon>
        <span>知识库</span>
      </el-menu-item>
    </el-menu>

    <div class="side-foot">
      <span class="pulse"></span>
      <span>SSE 流式</span>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()
</script>

<style lang="scss">
.side-nav {
  width: 196px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--line);
  display: flex;
  flex-direction: column;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 18px 17px;
  border-bottom: 1px solid var(--line);
}

.brand-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--accent);
  box-shadow: 0 0 12px var(--accent-glow);
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.brand-name {
  font-family: var(--font-mono);
  font-size: 12.5px;
  font-weight: 600;
  letter-spacing: .02em;
  color: var(--text);
}

.brand-sub {
  font-size: 11px;
  color: var(--text-3);
}

.side-menu {
  flex: 1;
  border-right: none;
  background: transparent;
  padding: 10px 0;
}

.side-menu .el-menu-item {
  height: 38px;
  line-height: 38px;
  margin: 2px 10px;
  border-radius: 8px;
  font-size: 13px;
  color: var(--text-2);
  position: relative;
}

.side-menu .el-menu-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.side-menu .el-menu-item.is-active {
  background: var(--accent-dim);
  color: var(--accent);
  font-weight: 500;
}

.side-menu .el-menu-item.is-active::before {
  content: '';
  position: absolute;
  left: -10px;
  top: 9px;
  bottom: 9px;
  width: 2px;
  border-radius: 2px;
  background: var(--accent);
  box-shadow: 0 0 8px var(--accent-glow);
}

.side-foot {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 14px 18px;
  border-top: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ok);
  box-shadow: 0 0 8px rgba(74, 222, 128, .6);
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: .3;
  }
}
</style>

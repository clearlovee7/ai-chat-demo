<template>
  <div class="knowledge-page">
    <SideNav />

    <div class="knowledge-main">
      <header class="page-top">
        <div class="top-info">
          <h2 class="top-title">知识库</h2>
          <span class="top-meta">{{ storeTotal }} 段片段</span>
        </div>
      </header>

      <div class="page-body">
        <div class="drop-zone" :class="{ dragging, 'has-file': !!selectedFile }" @click="pickFile"
          @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop">
          <input ref="fileInput" type="file" accept=".md,.txt,.text" hidden @change="onFileChange" />

          <template v-if="!selectedFile">
            <el-icon class="drop-icon">
              <UploadFilled />
            </el-icon>
            <p class="drop-title">拖拽文件到这里，或点击选择</p>
            <p class="drop-tip">支持 .md / .txt</p>
          </template>

          <template v-else>
            <el-icon class="drop-icon picked">
              <Document />
            </el-icon>
            <p class="drop-title">{{ selectedFile.name }}</p>
            <p class="drop-tip">
              {{ (selectedFile.size / 1024).toFixed(1) }} KB · 点击可重新选择
            </p>
          </template>
        </div>

        <div class="mode-row">
          <span class="row-label">入库模式</span>
          <el-radio-group v-model="mode" size="small">
            <el-radio value="append">追加到现有库</el-radio>
            <el-radio value="replace">清空重建</el-radio>
          </el-radio-group>
        </div>

        <el-button type="primary" class="submit-btn" :loading="uploading" :disabled="!selectedFile || uploading"
          @click="doUpload">
          {{ uploading ? '处理中…' : '开始入库' }}
        </el-button>

        <el-alert v-if="result" :title="result.text" :type="result.ok ? 'success' : 'error'" :closable="false" show-icon
          class="result" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import SideNav from '@/components/SideNav.vue'
import type { ApiError, IngestMode, IngestResult, StoreInfo } from '@/types/knowledge'

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const mode = ref<IngestMode>('append')
const dragging = ref(false)
const uploading = ref(false)
const storeTotal = ref(0)
const result = ref<{ ok: boolean; text: string } | null>(null)


onMounted(() => {
  loadStoreInfo()
})

// 查库状态（顶部显示片段数）
async function loadStoreInfo() {
  try {
    const res = await fetch('/api/store')
    const data = (await res.json()) as StoreInfo
    storeTotal.value = data.total ?? 0
  } catch {
    // 后端没起来就不显示，不打扰用户
  }
}


function pickFile() {
  fileInput.value?.click()
}

function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) setFile(file)
}

function onDrop(e: DragEvent) {
  dragging.value = false
  const file = e.dataTransfer?.files?.[0]
  if (file) setFile(file)
}

function setFile(file: File) {
  selectedFile.value = file
  result.value = null
}

// 读成文本 → POST JSON（不用 multer）
async function doUpload() {
  if (!selectedFile.value || uploading.value) return

  uploading.value = true
  result.value = null

  try {
    const content = await selectedFile.value.text()
    const res = await fetch('/api/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: selectedFile.value.name,
        content,
        mode: mode.value,
      }),
    })

    const data = (await res.json()) as IngestResult
    if (!res.ok) throw new Error((data as unknown as ApiError).error || '上传失败')

    result.value = {
      ok: true,
      text: `${data.filename}：切成 ${data.chunks} 段，库共 ${data.total} 段`,
    }
    storeTotal.value = data.total
    selectedFile.value = null
  } catch (e) {
    result.value = { ok: false, text: (e as Error).message }
  } finally {
    uploading.value = false
  }
}
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
  overflow-y: auto;
  padding: 32px;
  max-width: 720px;
}

.drop-zone {
  padding: 44px 24px;
  border: 1px dashed var(--line-2);
  border-radius: 14px;
  background: var(--surface);
  text-align: center;
  cursor: pointer;
  transition: border-color .18s, background .18s;

  &:hover {
    border-color: var(--accent-line);
    background: var(--surface-2);
  }

  &.dragging {
    border-color: var(--accent);
    background: var(--accent-dim);
  }

  &.has-file {
    border-style: solid;
    border-color: var(--accent-line);
  }
}

.drop-icon {
  font-size: 30px;
  color: var(--text-3);
  margin-bottom: 14px;

  &.picked {
    color: var(--accent);
  }
}

.drop-title {
  font-size: 14px;
  color: var(--text);
  margin-bottom: 8px;
  word-break: break-all;
}

.drop-tip {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--text-3);
}

.mode-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 26px;
}

.row-label {
  font-size: 13px;
  color: var(--text-2);
}

.submit-btn {
  margin-top: 22px;
  height: 40px;
  padding: 0 24px;
}

.result {
  margin-top: 20px;
}
</style>

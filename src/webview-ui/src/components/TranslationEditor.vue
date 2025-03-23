<template>
  <div class="container flex h-full mx-auto">
    <!-- 侧边栏 -->
    <div class="sidebar" :class="{ expanded: sidebarExpanded }">
      <div class="sidebar-header">
        <h3>{{ displayTitle }}</h3>
      </div>

      <!-- 侧边栏搜索框 -->
      <div class="sidebar-search" v-if="sidebarExpanded">
        <div class="relative">
          <input
            type="text"
            v-model="searchQuery"
            placeholder="搜索所有内容..."
            class="w-full px-2 py-1 pl-6 text-sm border rounded bg-vscode-input-bg border-vscode-panel-border"
          />
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="absolute transform -translate-y-1/2 left-2 top-1/2 text-vscode-descriptionForeground"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
      </div>

      <div class="sidebar-content">
        <!-- 已有翻译键区域 - 默认展开 -->
        <div class="section">
          <div class="section-header" @click="toggleSection('translationKeys')">
            <div class="flex items-center justify-between w-full">
              <span>已定义翻译键 ({{ filteredTranslationKeys.length }})</span>
              <svg
                class="transition-transform duration-200"
                :class="{ 'rotate-90': sections.translationKeys }"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </div>
          <div class="section-content" v-show="sections.translationKeys">
            <div v-if="filteredTranslationKeys.length === 0" class="p-3 text-sm text-center text-vscode-descriptionForeground">
              指当前文件中使用了$t函数且在JSON中有对应的键
            </div>
            <div
              v-for="item in filteredTranslationKeys"
              :key="item"
              class="key-item"
              :class="{ active: item === currentKey }"
              @click="switchToKeyAndLocate(item)"
            >
              {{ item }}
              <div class="extract-icon delete-icon" @click.stop="handleDeleteKey(item)" title="从JSON中删除此键">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
                  <line x1="16" y1="5" x2="19" y2="8"></line>
                  <line x1="19" y1="4" x2="16" y2="7"></line>
                  <path d="M9 11l4 4"></path>
                  <path d="M13 11l-4 4"></path>
                </svg>
              </div>
            </div>
            <div v-if="filteredTranslationKeys.length === 0" class="p-3 text-center text-vscode-descriptionForeground">
              {{ allTranslationKeys.length > 0 ? '无匹配结果' : '暂无翻译键' }}
            </div>
          </div>
        </div>

        <!-- 缺失翻译键区域 - 默认折叠 -->
        <div class="section">
          <div class="section-header" @click="toggleSection('missingKeys')">
            <div class="flex items-center justify-between w-full">
              <span class="text-vscode-errorForeground">未定义的翻译 ({{ filteredMissingKeys.length }})</span>
              <svg
                class="transition-transform duration-200"
                :class="{ 'rotate-90': sections.missingKeys }"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </div>
          <div class="section-content" v-show="sections.missingKeys">
            <div v-if="filteredMissingKeys.length === 0 && missingKeys.length === 0" class="p-3 text-sm text-center text-vscode-descriptionForeground">
              指当前文件中使用了$t函数但在JSON中没有对应的键
            </div>
            <div
              v-for="key in filteredMissingKeys"
              :key="key"
              class="key-item bg-vscode-list-warningForeground bg-opacity-10"
              @click="locateKeyUsage(key)"
            >
              {{ key }}
              <div class="extract-icon" @click.stop="addMissingKey(key)" title="添加到翻译文件">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </div>
            </div>
            <div
              v-if="filteredMissingKeys.length === 0 && missingKeys.length > 0"
              class="p-3 text-center text-vscode-descriptionForeground"
            >
              无匹配结果
            </div>
          </div>
        </div>

        <!-- 硬编码文本区域 - 默认折叠 -->
        <div class="section">
          <div class="section-header" @click="toggleSection('hardcodedTexts')">
            <div class="flex items-center justify-between w-full">
              <span class="text-vscode-warningForeground">硬编码文本 ({{ filteredHardcodedTexts.length }})</span>
              <svg
                class="transition-transform duration-200"
                :class="{ 'rotate-90': sections.hardcodedTexts }"
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </div>
          </div>
          <div class="section-content" v-show="sections.hardcodedTexts">
            <div v-if="filteredHardcodedTexts.length === 0 && hardcodedTexts.length === 0" class="p-3 text-sm text-center text-vscode-descriptionForeground">
              指当前文件中直接写入的文本字符串，可能需要国际化
            </div>
            <div
              v-for="text in filteredHardcodedTexts"
              :key="text.id"
              class="key-item bg-vscode-list-warningForeground bg-opacity-10"
              @click="navigateToHardcodedPosition(text.id)"
            >
              {{ text.text }}
              <div class="extract-icon" @click.stop="extractHardcoded(text.id)" title="提取为翻译键">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <polyline points="16 3 21 3 21 8"></polyline>
                  <line x1="4" y1="20" x2="21" y2="3"></line>
                  <path d="M21 13v8H3V5h8"></path>
                </svg>
              </div>
            </div>
            <div
              v-if="filteredHardcodedTexts.length === 0 && hardcodedTexts.length > 0"
              class="p-3 text-center text-vscode-descriptionForeground"
            >
              无匹配结果
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="p-4 editor-content">
      <!-- 操作栏 -->
      <div class="flex items-center justify-between mb-5 editor-header">
        <div class="flex items-center space-x-2">
          <button @click="toggleSidebar" class="icon-button" title="切换侧栏">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
          <button @click="handlePrevKey" class="icon-button" title="上一个键">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M15 18l-6-6 6-6"></path>
            </svg>
          </button>
          <button @click="handleNextKey" class="icon-button" title="下一个键">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M9 18l6-6-6-6"></path>
            </svg>
          </button>
        </div>
      </div>

      <!-- 标题栏 -->
      <div class="flex items-center justify-between pb-4 mb-4 border-b border-vscode-panel-border">
        <!-- 键名显示和编辑 -->
        <div class="flex items-center space-x-2">
          <span class="font-bold">
            <span class="px-2 py-1 rounded bg-vscode-input-bg">"{{ currentKey || '暂未选择KEY' }}"</span>
          </span>
          <div class="flex items-center space-x-2 key-area" v-show="currentKey">
            <button @click="handleEditKey" class="icon-button" title="编辑键">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path>
              </svg>
            </button>
            <button
              @click="() => handleDeleteKey()"
              class="icon-button delete-button title-btn"
              title="从JSON中删除此键"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7"></path>
                <line x1="16" y1="5" x2="19" y2="8"></line>
                <line x1="19" y1="4" x2="16" y2="7"></line>
                <path d="M9 11l4 4"></path>
                <path d="M13 11l-4 4"></path>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 翻译列表 -->
      <div class="space-y-4">
        <div
          v-for="(_, locale) in currentTranslations"
          :key="locale"
          class="flex items-center gap-3 p-3 border rounded border-vscode-panel-border bg-vscode-editor-background"
        >
          <div class="flex items-center space-x-3">
            <span class="px-2 py-1 font-bold rounded bg-vscode-badge-background text-vscode-badge-foreground">{{
              locale
            }}</span>
          </div>
          <input
            type="text"
            v-model="currentTranslations[locale]"
            class="w-full px-3 py-2 border rounded bg-vscode-input-bg text-vscode-fg border-vscode-panel-border focus:outline-none focus:border-vscode-focusBorder"
            @change="handleTranslationChange(locale)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';

// 状态
const currentKey = ref('');
const currentTranslations = ref<Record<string, string>>({});
const allTranslationKeys = ref<string[]>([]);
const searchQuery = ref('');
const sidebarExpanded = ref(true); // 默认展开侧边栏
const sourceFile = ref<string>('');
const missingKeys = ref<string[]>([]);
const hardcodedTexts = ref<{ id: string; text: string }[]>([]);

// 侧边栏各区域的展开/折叠状态
const sections = reactive({
  translationKeys: true, // 翻译键区域默认展开
  missingKeys: false, // 缺失键区域默认折叠
  hardcodedTexts: false // 硬编码区域默认折叠
});

// 计算属性：处理翻译键显示
const filteredTranslationKeys = computed(() => {
  if (!searchQuery.value.trim()) {
    return allTranslationKeys.value;
  }
  const query = searchQuery.value.toLowerCase();
  return allTranslationKeys.value.filter(key => key.toLowerCase().includes(query));
});

// 计算属性：过滤缺失的键
const filteredMissingKeys = computed(() => {
  if (!searchQuery.value.trim()) {
    return missingKeys.value;
  }
  const query = searchQuery.value.toLowerCase();
  return missingKeys.value.filter(key => key.toLowerCase().includes(query));
});

// 计算属性：过滤硬编码文本
const filteredHardcodedTexts = computed(() => {
  if (!searchQuery.value.trim()) {
    return hardcodedTexts.value;
  }
  const query = searchQuery.value.toLowerCase();
  return hardcodedTexts.value.filter(item => item.text.toLowerCase().includes(query));
});

// 计算属性：显示标题
const displayTitle = computed(() => {
  if (sourceFile.value) {
    return `文件: ${sourceFile.value}`;
  }
  return `翻译键列表`;
});

// 方法
function handleTranslationChange(locale: string): void {
  updateTranslation(currentKey.value, locale, currentTranslations.value[locale]);
}

function handleEditKey(): void {
  editKey(currentKey.value);
}

function handleDeleteKey(key?: string): void {
  const keyToDelete = key || currentKey.value;
  if (!keyToDelete) return;

  console.log(`确认删除键: ${keyToDelete}`);
  deleteKey(keyToDelete);
}

function handlePrevKey(): void {
  navigateKey(currentKey.value, 'prev');
}

function handleNextKey(): void {
  navigateKey(currentKey.value, 'next');
}

function toggleSidebar(): void {
  sidebarExpanded.value = !sidebarExpanded.value;
}

function toggleSection(section: 'translationKeys' | 'missingKeys' | 'hardcodedTexts'): void {
  sections[section] = !sections[section];
}

function switchToKeyAndLocate(key: string): void {
  // 先切换到对应的key
  navigateKey(key, 'direct');

  // 等待一小段时间后再定位，确保切换已完成
  setTimeout(() => {
    // 定位到键的使用位置
    locateKeyUsage(key);
  }, 500);
}

// VSCode通信相关方法
function updateTranslation(key: string, locale: string, value: string): void {
  vscode.postMessage({
    command: 'updateTranslation',
    key,
    locale,
    value
  });
}

function editKey(key: string): void {
  vscode.postMessage({
    command: 'editKey',
    key
  });
}

function deleteKey(key: string): void {
  vscode.postMessage({
    command: 'deleteKey',
    key
  });
}

function navigateKey(key: string, direction: string): void {
  if (direction === 'direct') {
    vscode.postMessage({
      command: 'navigateToKey',
      key
    });
  } else {
    vscode.postMessage({
      command: direction === 'prev' ? 'prevKey' : 'nextKey',
      key
    });
  }
}

// 添加未添加翻译的键
function addMissingKey(key: string): void {
  // 设置当前键
  currentKey.value = key;

  // 创建一个空的翻译对象
  const emptyTranslations: Record<string, string> = {};

  // 确保为每个语言添加一个空条目
  // 从currentTranslations中获取所有语言
  const existingLocales = Object.keys(currentTranslations.value);

  existingLocales.forEach((locale: string) => {
    emptyTranslations[locale] = '';
  });

  // 更新当前翻译
  currentTranslations.value = emptyTranslations;

  // 显示提示消息
  console.log(`准备添加新的翻译键: ${key}`);

  // 添加到所有键列表中，如果不存在
  if (!allTranslationKeys.value.includes(key)) {
    allTranslationKeys.value.push(key);
  }

  // 将此键从缺失键列表中移除
  const index = missingKeys.value.indexOf(key);
  if (index !== -1) {
    missingKeys.value.splice(index, 1);
  }
}

// 定位到键的使用位置
function locateKeyUsage(key: string): void {
  console.log('定位到键的使用位置:', key);

  // 确保键不为空
  if (!key || key.trim() === '') {
    console.error('尝试定位空键');
    return;
  }

  // 发送清晰的日志
  console.log(`正在发送locateKeyUsage命令，key=${key}`);

  // 添加错误处理
  try {
    vscode.postMessage({
      command: 'locateKeyUsage',
      key: key
    });
    console.log(`已发送locateKeyUsage命令`);
  } catch (error) {
    console.error('发送locateKeyUsage命令失败:', error);
  }
}

// 提取硬编码文本
function extractHardcoded(id: string): void {
  console.log('提取硬编码文本, ID:', id);
  if (!id) {
    console.error('硬编码文本ID不完整');
    return;
  }

  vscode.postMessage({
    command: 'extractHardcoded',
    id: id
  });
}

// 导航到硬编码文本的位置
function navigateToHardcodedPosition(id: string): void {
  console.log('导航到硬编码文本位置, ID:', id);
  if (!id) {
    console.error('硬编码文本ID不完整');
    return;
  }

  vscode.postMessage({
    command: 'navigateToHardcoded',
    id: id
  });
}

// 初始化
onMounted(() => {
  // 通知VSCode UI已准备好
  vscode.postMessage({ command: 'ready' });

  // 监听直接从VSCode传来的消息
  window.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    console.log('从VSCode接收消息:', message);

    // 初始化数据
    if (message.type === 'init') {
      currentKey.value = message.key;
      currentTranslations.value = message.translations;
      console.log('从VSCode接收初始化数据:', message.key, message.translations);
    }

    // 更新翻译内容
    else if (message.type === 'updateTranslations') {
      currentTranslations.value = message.translations;
      console.log('从VSCode接收更新翻译:', message.translations);
    }

    // 处理文件相关事件
    else if (message.type === 'fileKeys' || message.type === 'fileChanged') {
      console.log('接收到文件键数据:', message);

      // 更新键列表
      if (message.keys !== undefined) {
        allTranslationKeys.value = message.keys;
      }

      // 更新缺失键
      if (message.missingKeys !== undefined) {
        missingKeys.value = message.missingKeys;
      }

      // 更新硬编码文本
      if (message.hardcodedTexts !== undefined) {
        hardcodedTexts.value = message.hardcodedTexts;
      }

      // 更新源文件
      if (message.source !== undefined) {
        sourceFile.value = message.source;
      }

      console.log(
        `文件数据已更新: 文件=${sourceFile.value}, 键数量=${allTranslationKeys.value.length}, 缺失键=${missingKeys.value.length}`
      );
    }
  });

  // 请求监听文件变化
  // listenForFileChanges();
});
</script>

<style scoped>
.container {
  height: 100vh;
  width: 100%;
  margin: 0;
  max-width: none;
  padding: 0;
  overflow: hidden;
}

/* 侧边栏样式 */
.sidebar {
  width: 0;
  overflow: hidden;
  transition: width 0.3s ease;
  border-right: 1px solid var(--vscode-panel-border);
  background-color: var(--vscode-sideBar-background, #252526);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.sidebar.expanded {
  width: 300px;
  min-width: 300px;
}

.sidebar-header {
  padding: 8px 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--vscode-sideBarSectionHeader-background);
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}

.sidebar-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-search {
  padding: 8px;
  border-bottom: 1px solid var(--vscode-panel-border);
  flex-shrink: 0;
}

.sidebar-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0; /* 确保Flexbox子元素可以正确滚动 */
  max-height: calc(100% - 127px);
}

/* 区域样式 */
.section {
  border-bottom: 1px solid var(--vscode-panel-border);
}

.section-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 8px 12px;
  font-weight: 500;
  background-color: var(--vscode-sideBarSectionHeader-background);
  cursor: pointer;
  user-select: none;
}

.section-header:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.key-item {
  padding: 6px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--vscode-panel-border, #555);
  user-select: none;
  position: relative;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.key-item:hover {
  background-color: var(--vscode-list-hoverBackground);
}

.key-item.active {
  background-color: var(--vscode-list-activeSelectionBackground);
  color: var(--vscode-list-activeSelectionForeground);
}

.extract-icon {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  opacity: 0;
  cursor: pointer;
  transition: opacity 0.2s;
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
  padding: 2px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.key-item:hover .extract-icon {
  opacity: 1;
}

.extract-icon:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.editor-content {
  flex: 1;
  height: 100%;
  overflow: auto;
}

/* 图标按钮样式 */
.icon-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 4px;
  background-color: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  border: none;
  border-radius: 3px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.icon-button:hover {
  background-color: var(--vscode-button-secondaryHoverBackground);
}

.icon-button.primary {
  background-color: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.icon-button.primary:hover {
  background-color: var(--vscode-button-hoverBackground);
}

.delete-button {
  opacity: 0;
  transition: opacity 0.3s;
  background-color: var(--vscode-editorError-foreground, #f44747);
  color: white;
}

.delete-button.title-btn {
  opacity: 1;
}

.delete-button:hover {
  background-color: var(--vscode-editorError-foreground, #f44747);
  opacity: 1;
}

/* 让整个按钮区域成为key-area，这样鼠标悬停整个区域时就会显示删除按钮 */
.editor-header {
  position: relative;
}

.editor-header:hover .delete-button {
  opacity: 0.7;
}
</style>

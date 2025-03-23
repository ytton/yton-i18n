import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TranslationManager } from '../utils/translationManager';
import { getRelativePath } from '../utils/fileUtils';
import { FilePathManager } from '../utils/filePathManager';
import { Parser } from '../utils/parser';
import { Transformer } from '../utils/transformer';
import { Config } from '../utils/config';

/**
 * 翻译编辑器提供器
 */
export class TranslationEditorProvider {
  private panel: vscode.WebviewPanel | undefined;
  private currentKey: string = '';
  private currentSourceFile: string | undefined;
  private fileChangeDisposable: vscode.Disposable | undefined;
  private isListeningToFileChanges: boolean = false;
  private isFromFile: boolean = false;
  private _hardcodedTextsRanges = new Map<string, { range: vscode.Range; file: string }>();

  constructor(private context: vscode.ExtensionContext) {}

  /**
   * 打开编辑器
   * @param key 翻译键
   * @param translations 翻译值
   * @param sourceFilePath 源文件路径，如果提供则只显示该文件中使用的键
   */
  public async openEditor(key: string, translations?: Record<string, string>, sourceFilePath?: string): Promise<void> {
    try {
      console.log(`打开翻译编辑器: 键=${key}, 源文件=${sourceFilePath || '全局'}`);
      
      // 记录是否从文件打开
      this.isFromFile = !!sourceFilePath;
      
      // 设置当前源文件
      if (sourceFilePath) {
        this.currentSourceFile = sourceFilePath;
      }

      if (translations) {
        console.log(`提供的翻译:`, translations);
      }

      const finalTranslations = translations || TranslationManager.getKeyTranslations(key);
      console.log(`最终使用的翻译:`, finalTranslations);

      // 确定视图列：从文件打开时在右侧，否则在当前位置
      const viewColumn = sourceFilePath 
        ? vscode.ViewColumn.Beside 
        : vscode.ViewColumn.Active;
      
      // 决定是否保持编辑器焦点
      const preserveFocus = sourceFilePath ? true : false;

      // 如果面板已经存在，直接显示
      if (this.panel) {
        this.panel.reveal(viewColumn, preserveFocus);
        console.log(`翻译编辑器面板已存在，重新显示 (preserveFocus=${preserveFocus})`);

        // 设置超时确保面板准备好接收消息
        setTimeout(() => {
          if (this.panel) {
            this.panel.webview.postMessage({
              type: 'init',
              key,
              translations: finalTranslations
            });
            console.log(`已发送init消息到现有面板`);

            // 发送适当的键列表，优先考虑源文件
            if (sourceFilePath) {
              this.sendFileSpecificKeys(sourceFilePath);
            } else {
              this.sendAllKeys();
            }
          }
        }, 500);
        return;
      }

      // 创建新的WebView面板
      this.panel = vscode.window.createWebviewPanel('translationEditor', `翻译编辑器`, viewColumn, {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'webview-dist')),
          vscode.Uri.file(path.join(this.context.extensionPath, 'dist', 'webview-ui'))
        ]
      });

      this.currentKey = key;
      console.log(`新翻译编辑器面板已创建`);

      // 设置HTML内容
      this.panel.webview.html = this.getWebviewContent();

      // 处理来自WebView的消息
      this.panel.webview.onDidReceiveMessage(this.handleMessage.bind(this));

      // 面板关闭时进行清理
      this.panel.onDidDispose(() => {
        this.panel = undefined;
        this.currentKey = '';
        // 清理文件变化监听器
        this.cleanupFileChangeListeners();
        console.log(`翻译编辑器面板已关闭`);
      });

      // 设置更长的延迟以确保WebView完全加载
      setTimeout(() => {
        if (this.panel) {
          console.log(`准备发送初始化数据，源文件路径: ${sourceFilePath || '全局模式'}`);

          this.panel.webview.postMessage({
            type: 'init',
            key,
            translations: finalTranslations
          });

          // 发送适当的键列表，优先考虑源文件
          if (sourceFilePath) {
            this.sendFileSpecificKeys(sourceFilePath);

            // 从文件打开编辑器时，完成初始化后将焦点返回到原始编辑器
            vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
          } else {
            // 从所有翻译键打开时，发送所有键
            this.sendAllKeys();
          }

          console.log(`已发送初始化消息到新面板`);
        }
      }, 1500);
    } catch (error) {
      vscode.window.showErrorMessage(`打开翻译编辑器失败: ${error}`);
    }
  }

  /**
   * 处理来自WebView的消息
   */
  private async handleMessage(message: any): Promise<void> {
    console.log(`收到WebView消息:`, message);

    try {
      if (message.command === 'ready') {
        console.log(`WebView已准备好接收消息`);
      } else if (message.command === 'updateTranslation') {
        await this.updateTranslation(message.key, message.locale, message.value);
      } else if (message.command === 'editKey') {
        await this.editKey(message.key);
      } else if (message.command === 'deleteKey') {
        await this.deleteKey(message.key);
      } else if (message.command === 'navigateToKey') {
        await this.navigateToSpecificKey(message.key);
      } else if (message.command === 'prevKey') {
        await this.navigateToPrevKey(message.key);
      } else if (message.command === 'nextKey') {
        await this.navigateToNextKey(message.key);
      } else if (message.command === 'getAllKeys') {
        await this.sendAllKeys();
      } else if (message.command === 'filterKeys') {
        await this.filterKeys(message.query);
      } else if (message.command === 'listenFileChanges') {
        // 开始监听文件变化
        this.startListeningToFileChanges();
      } else if (message.command === 'extractHardcoded') {
        // 提取硬编码文本
        await this.extractHardcodedText(message.id);
      } else if (message.command === 'navigateToHardcoded') {
        // 导航到硬编码文本位置
        if (message.id) {
          await this.navigateToHardcodedPosition(message.id);
        }
      } else if (message.command === 'locateKeyUsage') {
        // 定位键的使用位置
        console.log(`收到定位键使用位置命令: ${message.key}`);
        if (message.key) {
          console.log(`执行定位键使用位置命令: ${message.key}`);
          try {
            // 确保聚焦到正确的编辑器
            if (this.currentSourceFile) {
              // 优先打开当前源文件
              const doc = await vscode.workspace.openTextDocument(this.currentSourceFile);
              await vscode.window.showTextDocument(doc, vscode.ViewColumn.One);
            }
            
            // 执行定位命令
            await vscode.commands.executeCommand('yton-i18n.locateKeyUsage', message.key);
            console.log(`定位键使用位置命令执行完成`);
          } catch (error) {
            console.error(`定位键使用位置命令执行失败:`, error);
            vscode.window.showErrorMessage(`定位键使用位置失败: ${error}`);
          }
        } else {
          console.warn(`定位键使用位置命令缺少key参数`);
        }
      } else {
        console.warn(`未知的WebView命令: ${message.command}`);
      }
    } catch (error) {
      console.error(`处理WebView消息失败:`, error);
      vscode.window.showErrorMessage(`处理WebView消息失败: ${error}`);
    }
  }

  /**
   * 发送所有翻译键
   */
  private async sendAllKeys(): Promise<void> {
    if (this.panel) {
      const allKeys = TranslationManager.getAllTranslationKeys();
      console.log(`发送所有翻译键: 共${allKeys.length}个`);
      this.panel.webview.postMessage({
        type: 'allKeys',
        keys: allKeys
      });
    }
  }

  /**
   * 过滤翻译键
   */
  private async filterKeys(query: string): Promise<void> {
    if (this.panel) {
      if (!query.trim()) {
        // 如果查询为空，则返回所有键
        this.sendAllKeys();
        return;
      }

      const allKeys = TranslationManager.getAllTranslationKeys();
      const queryLower = query.toLowerCase();

      // 过滤匹配查询的键
      const filteredKeys = allKeys.filter(key => key.toLowerCase().includes(queryLower));

      // 发送过滤后的键到WebView
      this.panel.webview.postMessage({
        type: 'filteredKeys',
        keys: filteredKeys
      });
    }
  }

  /**
   * 导航到指定键
   */
  private async navigateToSpecificKey(key: string): Promise<void> {
    if (this.panel) {
      const translations = TranslationManager.getKeyTranslations(key);
      this.panel.webview.postMessage({
        type: 'init',
        key: key,
        translations
      });
    }
  }

  /**
   * 更新翻译
   */
  private async updateTranslation(key: string, locale: string, value: string): Promise<void> {
    if (TranslationManager.updateKeyTranslation(key, locale, value)) {
      vscode.window.showInformationMessage(`成功更新 ${locale} 的翻译`);
    } else {
      vscode.window.showErrorMessage(`更新 ${locale} 的翻译失败`);
    }
  }

  /**
   * 编辑键名（重命名）
   */
  private async editKey(key: string): Promise<void> {
    const newKey = await vscode.window.showInputBox({
      prompt: '请输入新的键名',
      value: key,
      validateInput: value => {
        if (!value) {
          return '键名不能为空';
        }
        return null;
      }
    });

    if (!newKey || key === newKey) {
      return;
    }

    // 显示进度提示
    vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `正在更新键 "${key}" 为 "${newKey}"`,
        cancellable: false
      },
      async (progress) => {
        progress.report({ message: '更新翻译文件...' });
        
        // 1. 更新翻译文件中的键名
        if (TranslationManager.updateKey(key, newKey)) {
          // 2. 更新代码中的键引用
          progress.report({ message: '更新代码引用...' });
          const updatedFiles = await TranslationManager.updateKeyReferences(key, newKey);
          
          // 3. 更新完成，显示结果
          vscode.window.showInformationMessage(
            `成功将键 "${key}" 重命名为 "${newKey}"，更新了 ${updatedFiles} 个引用文件`
          );

          // 4. 刷新面板显示新的键
          if (this.panel) {
            const translations = TranslationManager.getKeyTranslations(newKey);
            this.panel.webview.postMessage({
              type: 'init',
              key: newKey,
              translations
            });
            
            // 重新发送所有键，因为键名已更改
            if (!this.isFromFile) {
              this.sendAllKeys();
            }
          }
        } else {
          vscode.window.showErrorMessage(`重命名键 "${key}" 失败`);
        }
      }
    );
  }

  /**
   * 导航到上一个键
   */
  private async navigateToPrevKey(key: string): Promise<void> {
    const allKeys = TranslationManager.getAllTranslationKeys();
    if (allKeys.length === 0) {
      return;
    }

    const currentIndex = allKeys.indexOf(key);
    if (currentIndex === -1) {
      return;
    }

    let newIndex;
    if (currentIndex === 0) {
      newIndex = allKeys.length - 1;
    } else {
      newIndex = currentIndex - 1;
    }

    const newKey = allKeys[newIndex];
    const translations = TranslationManager.getKeyTranslations(newKey);

    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'init',
        key: newKey,
        translations
      });
    }
  }

  /**
   * 导航到下一个键
   */
  private async navigateToNextKey(key: string): Promise<void> {
    const allKeys = TranslationManager.getAllTranslationKeys();
    if (allKeys.length === 0) {
      return;
    }

    const currentIndex = allKeys.indexOf(key);
    if (currentIndex === -1) {
      return;
    }

    let newIndex;
    if (currentIndex === allKeys.length - 1) {
      newIndex = 0;
    } else {
      newIndex = currentIndex + 1;
    }

    const newKey = allKeys[newIndex];
    const translations = TranslationManager.getKeyTranslations(newKey);

    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'init',
        key: newKey,
        translations
      });
    }
  }

  /**
   * 获取WebView内容
   */
  private getWebviewContent(): string {
    // 读取JS文件
    const jsUri = this.getWebviewUri('main.js');

    // 创建HTML
    return `
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>翻译编辑器</title>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            height: 100%;
            width: 100%;
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
            overflow: hidden;
          }
          .error {
            color: #ff5555;
            text-align: center;
            padding: 20px;
          }
          #app {
            height: 100%;
            width: 100%;
            display: flex;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <script>window.vscode = acquireVsCodeApi();</script>
        <div id="app"></div>
        <script type="module" src="${jsUri}"></script>
      </body>
      </html>
    `;
  }

  /**
   * 获取WebView资源URI
   */
  private getWebviewUri(filename: string): vscode.Uri {
    if (!this.panel) {
      throw new Error('翻译编辑器面板未初始化');
    }

    const webviewDistPath = path.join(this.context.extensionPath, 'src', 'webview-dist', filename);
    const distPath = path.join(this.context.extensionPath, 'dist', 'webview-ui', filename);

    let filePath: string;

    // 优先从开发目录读取，以支持热更新
    if (fs.existsSync(webviewDistPath)) {
      filePath = webviewDistPath;
      console.log(`从开发目录加载: ${filePath}`);
    }
    // 回退到构建目录
    else if (fs.existsSync(distPath)) {
      filePath = distPath;
      console.log(`从构建目录加载: ${filePath}`);
    }
    // 找不到文件
    else {
      console.error(`找不到文件: ${filename}`);
      throw new Error(`找不到文件: ${filename}`);
    }

    return this.panel.webview.asWebviewUri(vscode.Uri.file(filePath));
  }

  /**
   * 开始监听文件变化
   */
  private startListeningToFileChanges(): void {
    if (this.isListeningToFileChanges || !this.currentSourceFile) {
      return;
    }

    this.isListeningToFileChanges = true;
    console.log(`开始监听文件变化: ${this.currentSourceFile}`);

    // 创建一个disposable数组来存储所有需要清理的订阅
    const disposables: vscode.Disposable[] = [];

    // 获取locale文件列表
    const localeFiles = Config.getLocaleFiles().map(file => file.filePath);
    
    // 创建文件系统监听器，监听所有locale文件的变化
    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher("**/*.json");
    
    // 监听文件变化
    disposables.push(fileSystemWatcher.onDidChange(async uri => {
      if (!this.panel) {
        return;
      }
      
      // 检查是否是locale文件
      const isLocaleFile = localeFiles.some(path => uri.fsPath === path);
      if (isLocaleFile) {
        console.log(`检测到locale文件系统变化: ${uri.fsPath}`);
        
        // 如果当前正在编辑某个key，刷新该key的翻译
        if (this.currentKey) {
          const translations = TranslationManager.getKeyTranslations(this.currentKey);
          
          this.panel.webview.postMessage({
            type: 'updateTranslations',
            translations
          });
          
          console.log(`已更新当前key的翻译: ${this.currentKey}`);
        }
        
        // 刷新键列表
        if (this.isFromFile && this.currentSourceFile) {
          this.sendFileSpecificKeys(this.currentSourceFile);
        } else {
          this.sendAllKeys();
        }
      }
    }));
    
    disposables.push(fileSystemWatcher);
    
    // 监听文本文档变化
    disposables.push(vscode.workspace.onDidChangeTextDocument(async event => {
      // 确保面板存在
      if (!this.panel) {
        this.cleanupFileChangeListeners();
        return;
      }

      // 检查变化的文件是否是locale文件
      const localeFiles = Config.getLocaleFiles().map(file => file.filePath);
      const isLocaleFile = localeFiles.some(path => event.document.uri.fsPath === path);
      
      if (isLocaleFile) {
        console.log(`检测到locale文件变化: ${event.document.uri.fsPath}`);
        
        // 如果当前正在编辑某个key，刷新该key的翻译
        if (this.currentKey) {
          const translations = TranslationManager.getKeyTranslations(this.currentKey);
          
          this.panel.webview.postMessage({
            type: 'updateTranslations',
            translations
          });
          
          console.log(`已更新当前key的翻译: ${this.currentKey}`);
        }
        
        // 刷新键列表，因为可能有新增或删除的键
        if (this.isFromFile && this.currentSourceFile) {
          // 如果是文件特定视图，刷新该文件的键
          this.sendFileSpecificKeys(this.currentSourceFile);
        } else {
          // 全局视图，刷新所有键
          this.sendAllKeys();
        }
        
        return;
      }

      // 检查是否是当前监听的文件
      const currentFilePath = this.currentSourceFile;
      if (!currentFilePath) {
        return;
      }

      // 如果是当前文件发生变化，更新编辑器内容
      if (event.document.uri.fsPath === currentFilePath) {
        console.log(`检测到文件内容变化: ${currentFilePath}`);

        // 解析文件中的键和硬编码文本
        await this.updateWebviewWithFileChanges(event.document);
      }
    }));

    // 监听活动编辑器变化
    if (this.isFromFile) {
      disposables.push(vscode.window.onDidChangeActiveTextEditor(async editor => {
        if (!editor || !this.panel) {
          return;
        }

        // 只关心 .vue、.ts、.js 等源代码文件
        const supportedExtensions = ['.vue', '.ts', '.js', '.jsx', '.tsx'];
        const fileExtension = path.extname(editor.document.uri.fsPath).toLowerCase();
        
        if (!supportedExtensions.includes(fileExtension)) {
          return;
        }

        // 如果编辑器是从文件打开的，且切换到了新文件，更新当前文件
        if (this.isFromFile && editor.document.uri.fsPath !== this.currentSourceFile) {
          console.log(`活动编辑器已切换到新文件: ${editor.document.uri.fsPath}`);
          await this.updateWebviewWithFileChanges(editor.document);
        }
      }));
    }

    // 存储所有订阅，以便后续清理
    this.fileChangeDisposable = vscode.Disposable.from(...disposables);
  }

  /**
   * 清理文件变化监听器
   */
  private cleanupFileChangeListeners(): void {
    if (this.fileChangeDisposable) {
      this.fileChangeDisposable.dispose();
      this.fileChangeDisposable = undefined;
    }

    this.isListeningToFileChanges = false;
  }

  /**
   * 更新webview以反映文件变化
   */
  private async updateWebviewWithFileChanges(document: vscode.TextDocument): Promise<void> {
    const filePath = document.uri.fsPath;
    console.log(`文件内容变化: ${filePath}`);

    // 如果不是当前正在查看的文件，则忽略
    if (filePath !== this.currentSourceFile) {
      return;
    }

    // 使用相同的逻辑重新发送
    await this.sendFileSpecificKeys(filePath);
    
    // 通知WebView文件已更新
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'fileChanged',
        source: path.basename(filePath)
      });
    }
  }

  /**
   * 设置文件特定的键
   */
  public setFileKeys(keys: string[], sourceFilePath: string): void {
    if (!this.panel) {
      console.log(`未找到翻译编辑器面板，无法设置文件特定键`);
      return;
    }

    this.currentSourceFile = sourceFilePath;
    this.sendFileSpecificKeys(sourceFilePath);

    // 开始监听文件变化
    if (this.isListeningToFileChanges === false && this.panel) {
      this.startListeningToFileChanges();
    }
  }

  /**
   * 发送文件特定的键
   */
  private async sendFileSpecificKeys(filePath: string): Promise<void> {
    if (!this.panel) {
      return;
    }

    this.currentSourceFile = filePath;

    try {
      console.log(`发送文件特定的键: ${filePath}`);

      // 解析文件内容，获取使用的翻译键和硬编码文本
      const document = await vscode.workspace.openTextDocument(filePath);
      const fileContent = document.getText();
      const fileName = path.basename(filePath);
      
      // 1. 提取文件中使用的所有翻译键（包括$t等函数调用）
      const usedKeys = TranslationManager.extractKeysFromContent(fileContent);
      console.log(`从文件中提取到 ${usedKeys.length} 个使用的键`);
      
      // 2. 获取所有已定义的翻译键（在JSON中存在的键）
      const allDefinedKeys = TranslationManager.getAllTranslationKeys();
      
      // 3. 分为两类：
      // - translationKeys：既在文件中使用了$t，又在JSON中有定义的键
      // - missingKeys：在文件中使用了$t，但在JSON中没有定义的键
      const translationKeys = usedKeys.filter((key: string) => allDefinedKeys.includes(key));
      const missingKeys = usedKeys.filter((key: string) => !allDefinedKeys.includes(key));
      
      console.log(`分类结果: 已定义翻译键=${translationKeys.length}, 未定义的翻译=${missingKeys.length}`);
      
      // 4. 提取硬编码文本
      const hardcodedTexts = TranslationManager.extractHardcodedTextsFromContent(fileContent);
      console.log(`从文件中提取到 ${hardcodedTexts.length} 个硬编码文本`);
      
      // 保存硬编码文本位置信息，用于导航
      const hardcodedTextsInfo = new Map<string, { range: vscode.Range; file: string }>();
      
      // 为硬编码文本创建位置映射（简化处理，实际应根据文件内容定位）
      hardcodedTexts.forEach((item, index) => {
        const textPosition = fileContent.indexOf(item.text);
        if (textPosition >= 0) {
          const startPos = document.positionAt(textPosition);
          const endPos = document.positionAt(textPosition + item.text.length);
          hardcodedTextsInfo.set(item.id, {
            range: new vscode.Range(startPos, endPos),
            file: document.uri.fsPath
          });
        }
      });
      
      // 存储到全局位置信息映射
      this._hardcodedTextsRanges = hardcodedTextsInfo;

      // 5. 发送给Webview
      this.panel.webview.postMessage({
        type: 'fileKeys',
        source: fileName,
        keys: translationKeys,
        missingKeys: missingKeys,
        hardcodedTexts: hardcodedTexts.map((item) => ({
          id: item.id,
          text: item.text.length > 50 ? item.text.substring(0, 47) + '...' : item.text
        }))
      });

      // 如果当前有选中的键，同步更新其翻译
      if (this.currentKey && translationKeys.includes(this.currentKey)) {
        const translations = TranslationManager.getKeyTranslations(this.currentKey);
        this.panel.webview.postMessage({
          type: 'updateTranslations',
          translations
        });
      }
      
      // 开始监听文件变化
      if (this.isListeningToFileChanges === false) {
        this.startListeningToFileChanges();
      }
    } catch (error) {
      console.error(`发送文件特定的键失败:`, error);
      vscode.window.showErrorMessage(`处理文件失败: ${error}`);
    }
  }

  /**
   * 提取硬编码文本
   */
  private async extractHardcodedText(textId: string): Promise<void> {
    try {
      console.log(`准备提取硬编码文本, ID:`, textId);
      
      if (!this._hardcodedTextsRanges.has(textId)) {
        vscode.window.showErrorMessage(`无法提取硬编码文本: 找不到对应的位置信息`);
        return;
      }

      const rangeInfo = this._hardcodedTextsRanges.get(textId)!;
      const targetFilePath = rangeInfo.file;
      
      // 查找是否已有编辑器打开了目标文件
      const editors = vscode.window.visibleTextEditors;
      let editor: vscode.TextEditor | undefined;
      
      // 首先尝试在已打开的编辑器中查找
      for (const e of editors) {
        if (e.document.uri.fsPath === targetFilePath) {
          editor = e;
          break;
        }
      }
      
      // 如果没有找到已打开的编辑器，则打开文件
      if (!editor) {
        console.log(`在已打开的编辑器中未找到文件，正在打开: ${targetFilePath}`);
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFilePath));
        editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One, // 在左侧编辑器组中打开
          preserveFocus: false // 聚焦到文本编辑器以执行提取
        });
      } else {
        console.log(`在已打开的编辑器中找到文件: ${targetFilePath}`);
        // 确保编辑器显示在左侧并获得焦点
        await vscode.window.showTextDocument(editor.document, {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: false
        });
      }
      
      if (!editor) {
        vscode.window.showErrorMessage(`无法打开文件: ${targetFilePath}`);
        return;
      }
      
      // 获取文本内容
      const text = editor.document.getText(rangeInfo.range);
      
      // 使用命令提取硬编码文本
      await vscode.commands.executeCommand(
        'yton-i18n.extractHardcodedText', 
        text, 
        {
          start: { line: rangeInfo.range.start.line, character: rangeInfo.range.start.character },
          end: { line: rangeInfo.range.end.line, character: rangeInfo.range.end.character }
        }
      );
      
      console.log(`已发送提取硬编码文本命令: "${text}"`);
      
      // 提取完成后刷新文件数据
      setTimeout(async () => {
        if (this.currentSourceFile) {
          // 重新分析当前文件
          await this.sendFileSpecificKeys(this.currentSourceFile);
          console.log(`提取硬编码文本后已刷新文件数据: ${this.currentSourceFile}`);
          
          // 完成后将焦点返回到翻译编辑器
          setTimeout(() => {
            vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
          }, 300);
        }
      }, 500); // 给一些时间让提取操作完成
    } catch (error) {
      console.error(`提取硬编码文本失败:`, error);
      vscode.window.showErrorMessage(`提取硬编码文本失败: ${error}`);
    }
  }

  /**
   * 导航到硬编码文本的位置
   */
  private async navigateToHardcodedPosition(textId: string): Promise<void> {
    try {
      console.log(`导航到硬编码文本位置, ID:`, textId);
      
      if (!this._hardcodedTextsRanges.has(textId)) {
        vscode.window.showErrorMessage(`无法定位到硬编码文本: 找不到对应的位置信息`);
        return;
      }

      const rangeInfo = this._hardcodedTextsRanges.get(textId)!;
      const targetFilePath = rangeInfo.file;
      
      // 查找是否已有编辑器打开了目标文件
      const editors = vscode.window.visibleTextEditors;
      let editor: vscode.TextEditor | undefined;
      
      // 首先尝试在已打开的编辑器中查找
      for (const e of editors) {
        if (e.document.uri.fsPath === targetFilePath) {
          editor = e;
          break;
        }
      }
      
      // 如果没有找到已打开的编辑器，则打开文件
      if (!editor) {
        console.log(`在已打开的编辑器中未找到文件，正在打开: ${targetFilePath}`);
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetFilePath));
        editor = await vscode.window.showTextDocument(document, {
          viewColumn: vscode.ViewColumn.One, // 在左侧编辑器组中打开
          preserveFocus: true // 保持焦点在翻译编辑器上
        });
      } else {
        console.log(`在已打开的编辑器中找到文件: ${targetFilePath}`);
        // 确保编辑器显示在左侧
        await vscode.window.showTextDocument(editor.document, {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: true
        });
      }
      
      if (!editor) {
        vscode.window.showErrorMessage(`无法打开文件: ${targetFilePath}`);
        return;
      }
      
      // 获取文本内容
      const text = editor.document.getText(rangeInfo.range);
      
      // 设置编辑器选择和视图
      editor.selection = new vscode.Selection(rangeInfo.range.start, rangeInfo.range.end);
      editor.revealRange(rangeInfo.range, vscode.TextEditorRevealType.InCenter);
      
      // 聚焦到编辑器一小会儿，让用户看到选中的位置，然后焦点返回到翻译编辑器
      setTimeout(() => {
        vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
      }, 500);
      
      vscode.window.showInformationMessage(`已定位到硬编码文本: "${text}"`);
    } catch (error) {
      console.error(`导航到硬编码文本位置失败:`, error);
      vscode.window.showErrorMessage(`导航到硬编码文本位置失败: ${error}`);
    }
  }

  /**
   * 从翻译文件中删除键
   */
  private async deleteKey(key: string): Promise<void> {
    try {
      // 显示进度提示
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `正在从翻译文件中删除键 "${key}"`,
          cancellable: false
        },
        async (progress) => {
          // 从翻译文件中删除键
          progress.report({ message: '从翻译文件中删除键...' });
          const deleteResult = TranslationManager.deleteTranslationKey(key);
          
          if (deleteResult) {
            // 更新完成，显示结果
            vscode.window.showInformationMessage(
              `成功从翻译文件中删除键 "${key}"`
            );
            
            // 重新加载键列表
            if (this.panel) {
              // 导航到其他键或清空当前键
              const allKeys = TranslationManager.getAllTranslationKeys();
              
              if (allKeys.length > 0) {
                const newKey = allKeys[0];
                const newTranslations = TranslationManager.getKeyTranslations(newKey);
                
                this.panel.webview.postMessage({
                  type: 'init',
                  key: newKey,
                  translations: newTranslations
                });
              } else {
                // 如果没有其他键，清空当前键
                this.panel.webview.postMessage({
                  type: 'init',
                  key: '',
                  translations: {}
                });
              }
              
              // 重新发送所有键
              if (!this.isFromFile) {
                this.sendAllKeys();
              } else if (this.currentSourceFile) {
                // 如果是从文件打开的，更新文件特定的键
                this.sendFileSpecificKeys(this.currentSourceFile);
              }
            }
          } else {
            vscode.window.showErrorMessage(`删除键 "${key}" 失败`);
          }
        }
      );
    } catch (error) {
      vscode.window.showErrorMessage(`删除键失败: ${error}`);
    }
  }

  /**
   * 释放所有资源
   */
  public dispose(): void {
    // 清理文件变化监听器
    this.cleanupFileChangeListeners();

    // 关闭面板
    if (this.panel) {
      this.panel.dispose();
      this.panel = undefined;
    }

    this.currentKey = '';
    this.currentSourceFile = undefined;
  }
}

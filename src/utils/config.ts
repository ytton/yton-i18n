import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 获取插件配置
 */
export class Config {
  /**
   * 获取国际化文件目录配置
   */
  static getLocalesDir(): string {
    const config = vscode.workspace.getConfiguration('yton-i18n');
    return config.get<string>('localesDir', './locales');
  }

  /**
   * 获取国际化文件名正则配置
   */
  static getLocaleFileRegex(): RegExp {
    const config = vscode.workspace.getConfiguration('yton-i18n');
    const regexStr = config.get<string>('localeFileRegex', '(\\w+).json');
    return new RegExp(regexStr);
  }

  /**
   * 获取需要国际化的HTML标签属性
   */
  static getHtmlAttributes(): string[] {
    const config = vscode.workspace.getConfiguration('yton-i18n');
    return config.get<string[]>('htmlAttributes', ['title', 'alt']);
  }

  /**
   * 获取需要检测硬编码文本的文件类型
   */
  static getHardcodedFileTypes(): string[] {
    const config = vscode.workspace.getConfiguration('yton-i18n');
    return config.get<string[]>('hardcodedFileTypes', [
      'vue', 'js', 'ts', 'jsx', 'tsx', 'html', 'htm', 'css', 'scss', 'less'
    ]);
  }

  /**
   * 检查内联翻译是否启用
   */
  static isInlineTranslationEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('yton-i18n');
    return config.get<boolean>('enableInlineTranslation', false);
  }

  /**
   * 获取默认语言
   */
  static getDefaultLocale(): string {
    const localeFiles = this.getLocaleFiles();
    if (localeFiles.length === 0) {
      return '';
    }
    // 使用第一个语言文件作为默认语言
    return localeFiles[0].name;
  }

  /**
   * 获取工作区根目录绝对路径
   */
  static getWorkspaceRoot(): string | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    return workspaceFolders[0].uri.fsPath;
  }

  /**
   * 获取国际化文件目录的绝对路径
   */
  static getLocalesDirPath(): string | undefined {
    const workspaceRoot = this.getWorkspaceRoot();
    if (!workspaceRoot) {
      return undefined;
    }

    return path.join(workspaceRoot, this.getLocalesDir());
  }

  /**
   * 获取所有语言文件
   */
  static getLocaleFiles(): { name: string, filePath: string }[] {
    const localesDirPath = this.getLocalesDirPath();
    if (!localesDirPath || !fs.existsSync(localesDirPath)) {
      return [];
    }

    const regex = this.getLocaleFileRegex();
    const localeFiles: { name: string, filePath: string }[] = [];
    
    try {
      const files = fs.readdirSync(localesDirPath);
      for (const file of files) {
        const match = file.match(regex);
        if (match && match[1]) {
          localeFiles.push({
            name: match[1],
            filePath: path.join(localesDirPath, file)
          });
        }
      }
    } catch (error) {
      console.error('Failed to read locale files:', error);
    }

    return localeFiles;
  }

  /**
   * 获取指定的本地化文件内容
   */
  static getLocaleFileContent(name: string): Record<string, any> {
    const localeFiles = this.getLocaleFiles();
    const localeFile = localeFiles.find(file => file.name === name);
    
    if (!localeFile || !fs.existsSync(localeFile.filePath)) {
      console.error(`本地化文件不存在: ${name}`);
      return {};
    }
    
    try {
      const fileContent = fs.readFileSync(localeFile.filePath, 'utf-8');
      const content = JSON.parse(fileContent);
      return content;
    } catch (error) {
      console.error(`读取本地化文件失败: ${localeFile.filePath}`, error);
      return {};
    }
  }

  /**
   * 写入本地化文件内容
   */
  static saveLocaleFileContent(localeName: string, content: Record<string, any>): boolean {
    const localeFiles = this.getLocaleFiles();
    const localeFile = localeFiles.find(file => file.name === localeName);
    
    if (localeFile) {
      try {
        fs.writeFileSync(localeFile.filePath, JSON.stringify(content, null, 2), 'utf-8');
        return true;
      } catch (error) {
        console.error(`Failed to write locale file ${localeFile.filePath}:`, error);
      }
    }
    
    return false;
  }

  /**
   * 获取需要检测硬编码文本的HTML属性
   */
  static getHardcodedAttributes(): string[] {
    const config = vscode.workspace.getConfiguration('yton-i18n');
    return config.get<string[]>('hardcodedAttributes', ['title', 'alt', 'content', 'description']);
  }
} 
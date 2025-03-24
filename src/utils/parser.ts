import * as vscode from "vscode";
import { Config } from "./config";

// 定义硬编码类型
export interface HardcodedText {
  text: string;
  range: vscode.Range;
  isHtml: boolean;
  isVueAttribute: boolean;
  isVueScript: boolean;
  attributeName?: string;
}

/**
 * 文件解析器工具类
 */
export class Parser {
  /**
   * 解析文件中的硬编码文本
   */
  static async parseHardcodedTexts(
    document: vscode.TextDocument
  ): Promise<HardcodedText[]> {
    const texts: HardcodedText[] = [];
    const fileExt = document.fileName.split(".").pop()?.toLowerCase();

    console.log(`开始解析文件: ${document.fileName}, 文件类型: ${fileExt}`);

    // 检查文件类型是否配置为需要检测
    const supportedFileTypes = Config.getHardcodedFileTypes();
    if (!fileExt || !supportedFileTypes.includes(fileExt)) {
      console.log(`跳过文件类型 ${fileExt}, 不在配置的检测范围内`);
      return texts;
    }

    // 处理不同类型的文件
    if (fileExt === "vue") {
      console.log("解析Vue文件中的硬编码文本");
      await this.parseVueFile(document, texts);
    } else if (["js", "ts", "jsx", "tsx"].includes(fileExt)) {
      console.log("解析JS/TS文件中的硬编码文本");
      await this.parseJsFile(document, texts);
    } else if (["html", "htm"].includes(fileExt)) {
      console.log("解析HTML文件中的硬编码文本");
      await this.parseHtmlFile(document, texts);
    } else if (["css", "scss", "less"].includes(fileExt)) {
      console.log("解析CSS文件中的硬编码文本");
      await this.parseCssFile(document, texts);
    } else {
      console.log("解析通用文本文件中的硬编码文本");
      await this.parseGenericFile(document, texts);
    }

    console.log(`解析到 ${texts.length} 个硬编码文本，文件类型: ${fileExt}`);
    return texts;
  }

  /**
   * 解析Vue文件中的硬编码文本
   */
  private static async parseVueFile(
    document: vscode.TextDocument,
    texts: HardcodedText[]
  ): Promise<void> {
    const text = document.getText();

    // 简单解析Vue文件，分离模板和脚本部分
    const templateMatch = /<template>([\s\S]*?)<\/template>/i.exec(text);
    const scriptMatch = /<script.*?>([\s\S]*?)<\/script>/i.exec(text);

    if (templateMatch) {
      const templateContent = templateMatch[1];
      const templateStartOffset = templateMatch.index + "<template>".length;

      // 解析模板中的文本
      console.log("解析Vue模板部分");
      await this.parseVueTemplate(
        document,
        templateContent,
        templateStartOffset,
        texts
      );
    } else {
      console.log("未找到Vue模板部分");
    }

    if (scriptMatch) {
      const scriptContent = scriptMatch[1];
      const scriptStartOffset =
        scriptMatch.index + scriptMatch[0].indexOf(">") + 1;

      // 解析脚本中的文本
      console.log("解析Vue脚本部分");
      await this.parseJsContent(
        document,
        scriptContent,
        scriptStartOffset,
        texts,
        true
      );
    } else {
      console.log("未找到Vue脚本部分");
    }

    // 解析style部分中的硬编码文本
    const styleMatches = /<style.*?>([\s\S]*?)<\/style>/gi;
    let styleMatch;
    let styleIndex = 0;

    while ((styleMatch = styleMatches.exec(text)) !== null) {
      styleIndex++;
      console.log(`解析Vue样式部分 #${styleIndex}`);
      const styleContent = styleMatch[1];
      const styleStartOffset =
        styleMatch.index + styleMatch[0].indexOf(">") + 1;

      // 用CSS解析器解析样式内容
      const styleTexts: HardcodedText[] = [];
      await this.parseCssContent(
        document,
        styleContent,
        styleStartOffset,
        styleTexts
      );
      texts.push(...styleTexts);
    }
  }

  /**
   * 解析Vue模板中的硬编码文本
   */
  private static async parseVueTemplate(
    document: vscode.TextDocument,
    content: string,
    startOffset: number,
    texts: HardcodedText[]
  ): Promise<void> {
    // 记录初始硬编码文本数量，用于调试
    const initialCount = texts.length;

    // 用于去重，避免多次添加相同的文本
    const uniqueTexts = new Set<string>();

    // 1. 解析标签内文本
    // 正则表达式匹配HTML文本内容，但不匹配Vue表达式
    const textRegex = />([^<>{]*?)(?:\{\{.*?\}\}[^<>{]*?)*?</g;
    let match;

    while ((match = textRegex.exec(content)) !== null) {
      if (match[1]) {
        // 提取纯文本部分（排除Vue表达式）
        const rawText = match[1];
        const cleanedText = rawText.trim();

        // 过滤掉只包含空白符和纯数字的文本，以及已经添加过的文本
        if (
          cleanedText.length > 1 &&
          !/^\s*$/.test(cleanedText) &&
          !/^\d+$/.test(cleanedText) &&
          !uniqueTexts.has(cleanedText)
        ) {
          uniqueTexts.add(cleanedText);
          const startPos = document.positionAt(startOffset + match.index + 1);
          const endPos = document.positionAt(
            startOffset + match.index + 1 + rawText.length
          );
          texts.push({
            text: cleanedText,
            range: new vscode.Range(startPos, endPos),
            isHtml: true,
            isVueAttribute: false,
            isVueScript: false,
          });
        }
      }
    }

    // 2. 只提取配置中指定的属性
    const hardcodedAttributes = Config.getHardcodedAttributes();

    // 对每个属性使用单独的正则表达式
    for (const attr of hardcodedAttributes) {
      // 匹配常规HTML属性值 (不包含:或v-bind:前缀)
      const regexStr = `${attr}=['"]((?!\\{\\{|\\$t\\()[^'"]*?)['"]`;
      const attrRegex = new RegExp(regexStr, "g");

      // 匹配每个属性
      while ((match = attrRegex.exec(content)) !== null) {
        if (match[1]) {
          const attrText = match[1].trim();

          // 过滤掉短文本、纯数字、布尔值和已添加的文本
          if (
            attrText.length > 1 &&
            !/^\d+$/.test(attrText) &&
            !["true", "false"].includes(attrText) &&
            !uniqueTexts.has(attrText)
          ) {
            uniqueTexts.add(attrText);

            // 计算位置
            const attrStart = match.index + match[0].indexOf(match[1]);
            const startPos = document.positionAt(startOffset + attrStart);
            const endPos = document.positionAt(
              startOffset + attrStart + match[1].length
            );

            texts.push({
              text: attrText,
              range: new vscode.Range(startPos, endPos),
              isHtml: false,
              isVueAttribute: true,
              isVueScript: false,
              attributeName: attr,
            });
          }
        }
      }
    }

    console.log(
      `Vue模板解析完成，找到 ${texts.length - initialCount} 个硬编码文本`
    );
  }

  /**
   * 解析JS/TS文件中的硬编码文本
   */
  private static async parseJsFile(
    document: vscode.TextDocument,
    texts: HardcodedText[]
  ): Promise<void> {
    const content = document.getText();
    await this.parseJsContent(document, content, 0, texts, false);
  }

  /**
   * 解析JS/TS内容中的硬编码文本
   */
  private static async parseJsContent(
    document: vscode.TextDocument,
    content: string,
    startOffset: number,
    texts: HardcodedText[],
    isVueScript: boolean
  ): Promise<void> {
    // 用于去重，避免多次添加相同的文本
    const uniqueTexts = new Set<string>();
    const initialCount = texts.length;

    // 匹配字符串字面量，支持单引号、双引号和反引号
    const stringRegex =
      /(?<!(^|\s|,|\[)t\s*\(\s*)(['"`])((?:\\\2|(?!\2)\s|\S)+?)\2(?!(\)\s*[,]|\)\s*`))/g;
    let match;

    while ((match = stringRegex.exec(content)) !== null) {
      // 提取匹配的字符串内容（从三个捕获组中取非undefined的一个）
      const text = match[0];

      // 跳过空字符串、只包含空白字符、纯数字的字符串或已添加的文本
      if (
        !text ||
        text.length <= 1 ||
        /^\s*$/.test(text) ||
        /^\d+$/.test(text) ||
        uniqueTexts.has(text)
      ) {
        continue;
      }

      // 跳过不太可能是人类语言的字符串（如变量名、属性名等）
      if (
        // 跳过标识符类型的字符串
        /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(text) ||
        // 跳过文件路径和URL
        /^[\/\.]|\.([a-z]{2,4})$|^https?:\/\/|^www\.|^ftp:\/\//.test(text) ||
        // 跳过布尔值和null
        ["true", "false", "null", "undefined"].includes(text)
      ) {
        continue;
      }

      // 添加到去重集合
      uniqueTexts.add(text);

      // 计算位置
      const startPos = document.positionAt(startOffset + match.index);
      const endPos = document.positionAt(
        startOffset + match.index + match[0].length
      );
      texts.push({
        text: text.slice(1, -1),
        range: new vscode.Range(startPos, endPos),
        isHtml: false,
        isVueAttribute: false,
        isVueScript: isVueScript,
      });
    }

    console.log(
      `JS内容解析完成，找到 ${texts.length - initialCount} 个硬编码文本`
    );
  }

  /**
   * 解析选中区域中的硬编码文本
   */
  static async parseSelectedText(
    document: vscode.TextDocument,
    selection: vscode.Selection
  ): Promise<HardcodedText[]> {
    const allTexts = await this.parseHardcodedTexts(document);

    // 过滤出选中区域内的硬编码文本
    return allTexts.filter((text) =>
      this.rangeIntersects(text.range, selection)
    );
  }

  /**
   * 检查两个Range是否有交集
   */
  private static rangeIntersects(
    range1: vscode.Range,
    range2: vscode.Range
  ): boolean {
    return (
      !range1.end.isBefore(range2.start) && !range2.end.isBefore(range1.start)
    );
  }

  /**
   * 解析文件中所有的$t函数调用
   * @param document 文档对象
   * @returns 所有$t函数调用中的键名数组
   */
  static parseTranslationKeys(document: vscode.TextDocument): string[] {
    const text = document.getText();
    const keys: string[] = [];

    // 匹配$t('key')或t('key')格式
    const regex = /(?:\$|(?<!\w))t\(\s*(['"`])(.+?)\1\s*(?:,\s*.+?)?\)/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const key = match[2];
      if (key && !keys.includes(key)) {
        keys.push(key);
      }
    }

    // 去重并返回
    return Array.from(new Set(keys));
  }

  /**
   * 解析HTML文件中的硬编码文本
   */
  private static async parseHtmlFile(
    document: vscode.TextDocument,
    texts: HardcodedText[]
  ): Promise<void> {
    const content = document.getText();
    const initialCount = texts.length;

    // 用于去重，避免多次添加相同的文本
    const uniqueTexts = new Set<string>();

    // 解析HTML标签内的文本内容
    const tagContentRegex = />([^<>]+)</g;
    let match;

    while ((match = tagContentRegex.exec(content)) !== null) {
      if (match[1]) {
        const text = match[1].trim();

        // 过滤掉空文本、短文本、纯数字和已添加的文本
        if (
          text &&
          text.length > 1 &&
          !/^\d+$/.test(text) &&
          !/^\s*$/.test(text) &&
          !uniqueTexts.has(text)
        ) {
          uniqueTexts.add(text);
          const startPos = document.positionAt(match.index + 1);
          const endPos = document.positionAt(match.index + 1 + match[1].length);

          texts.push({
            text,
            range: new vscode.Range(startPos, endPos),
            isHtml: true,
            isVueAttribute: false,
            isVueScript: false,
          });
        }
      }
    }

    // 解析HTML属性值，仅指定的属性
    const hardcodedAttributes = Config.getHardcodedAttributes();

    for (const attr of hardcodedAttributes) {
      const attrRegex = new RegExp(`${attr}=["']([^"'<>]+)["']`, "g");

      while ((match = attrRegex.exec(content)) !== null) {
        if (match[1]) {
          const text = match[1].trim();

          // 过滤掉空文本、短文本、纯数字、特殊值和已添加的文本
          if (
            text &&
            text.length > 1 &&
            !/^\d+$/.test(text) &&
            !["true", "false"].includes(text) &&
            !uniqueTexts.has(text)
          ) {
            uniqueTexts.add(text);
            const startPos = document.positionAt(match.index + attr.length + 2);
            const endPos = document.positionAt(
              match.index + attr.length + 2 + match[1].length
            );

            texts.push({
              text,
              range: new vscode.Range(startPos, endPos),
              isHtml: true,
              isVueAttribute: true,
              isVueScript: false,
              attributeName: attr,
            });
          }
        }
      }
    }

    console.log(
      `HTML文件解析完成，找到 ${texts.length - initialCount} 个硬编码文本`
    );
  }

  /**
   * 解析CSS内容中的硬编码文本
   */
  private static async parseCssContent(
    document: vscode.TextDocument,
    content: string,
    startOffset: number,
    texts: HardcodedText[]
  ): Promise<void> {
    //XXX: css的处理意义不大，跳过
    return;
    const initialCount = texts.length;

    // 用于去重，避免多次添加相同的文本
    const uniqueTexts = new Set<string>();

    // 匹配CSS中的字符串
    const strRegex = /['"]([^'"]+)['"]/g;
    let match;

    while ((match = strRegex.exec(content)) !== null) {
      if (match[1]) {
        const text = match[1].trim();

        // 过滤掉空文本、短文本、纯数字、URL、路径和已添加的文本
        if (
          text &&
          text.length > 1 &&
          !/^\d+$/.test(text) &&
          !/^(https?:\/\/|\/)/.test(text) &&
          !uniqueTexts.has(text)
        ) {
          uniqueTexts.add(text);
          const startPos = document.positionAt(startOffset + match.index + 1);
          const endPos = document.positionAt(
            startOffset + match.index + 1 + match[1].length
          );

          texts.push({
            text,
            range: new vscode.Range(startPos, endPos),
            isHtml: false,
            isVueAttribute: false,
            isVueScript: false,
          });
        }
      }
    }

    console.log(
      `CSS内容解析完成，找到 ${texts.length - initialCount} 个硬编码文本`
    );
  }

  /**
   * 解析CSS文件中的硬编码文本
   */
  private static async parseCssFile(
    document: vscode.TextDocument,
    texts: HardcodedText[]
  ): Promise<void> {
    const content = document.getText();
    await this.parseCssContent(document, content, 0, texts);
  }

  /**
   * 解析通用文本文件中的硬编码文本
   */
  private static async parseGenericFile(
    document: vscode.TextDocument,
    texts: HardcodedText[]
  ): Promise<void> {
    const content = document.getText();
    const initialCount = texts.length;

    // 用于去重，避免多次添加相同的文本
    const uniqueTexts = new Set<string>();

    // 匹配双引号字符串
    const doubleQuoteRegex = /"([^"\\]*(\\.[^"\\]*)*)"/g;
    let match;

    while ((match = doubleQuoteRegex.exec(content)) !== null) {
      if (match[1]) {
        const text = match[1].trim();

        // 过滤掉空文本、短文本、纯数字、特殊格式和已添加的文本
        if (
          text &&
          text.length > 1 &&
          !/^\d+$/.test(text) &&
          !text.includes("$t(") &&
          !uniqueTexts.has(text)
        ) {
          uniqueTexts.add(text);
          const startPos = document.positionAt(match.index + 1);
          const endPos = document.positionAt(match.index + 1 + match[1].length);

          texts.push({
            text,
            range: new vscode.Range(startPos, endPos),
            isHtml: false,
            isVueAttribute: false,
            isVueScript: false,
          });
        }
      }
    }

    // 匹配单引号字符串
    const singleQuoteRegex = /'([^'\\]*(\\.[^'\\]*)*)'/g;

    while ((match = singleQuoteRegex.exec(content)) !== null) {
      if (match[1]) {
        const text = match[1].trim();

        // 过滤掉空文本、短文本、纯数字、特殊格式和已添加的文本
        if (
          text &&
          text.length > 1 &&
          !/^\d+$/.test(text) &&
          !text.includes("$t(") &&
          !uniqueTexts.has(text)
        ) {
          uniqueTexts.add(text);
          const startPos = document.positionAt(match.index + 1);
          const endPos = document.positionAt(match.index + 1 + match[1].length);

          texts.push({
            text,
            range: new vscode.Range(startPos, endPos),
            isHtml: false,
            isVueAttribute: false,
            isVueScript: false,
          });
        }
      }
    }

    console.log(
      `通用文件解析完成，找到 ${texts.length - initialCount} 个硬编码文本`
    );
  }
}

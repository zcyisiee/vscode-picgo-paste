import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { exec, spawn } from 'child_process';

/**
 * 获取配置
 */
function getConfig() {
    const config = vscode.workspace.getConfiguration('picgo-paste');
    return {
        picgoPath: config.get<string>('picgoPath', 'picgo'),
        autoUploadOnPaste: config.get<boolean>('autoUploadOnPaste', true)
    };
}

/**
 * 将剪贴板图片保存到临时文件
 */
async function saveClipboardImageToFile(): Promise<string | null> {
    const tempDir = os.tmpdir();
    const tempFileName = `vscode_picgo_${Date.now()}.png`;
    const tempFilePath = path.join(tempDir, tempFileName);

    return new Promise((resolve) => {
        if (process.platform === 'darwin') {
            // macOS: 使用 osascript 保存剪贴板图片
            const script = `
                set theFile to POSIX file "${tempFilePath}"
                try
                    set imageData to the clipboard as «class PNGf»
                    set fileRef to open for access theFile with write permission
                    write imageData to fileRef
                    close access fileRef
                    return "success"
                on error
                    try
                        close access theFile
                    end try
                    return "no image"
                end try
            `;
            
            exec(`osascript -e '${script}'`, (error, stdout) => {
                if (error || stdout.trim() !== 'success') {
                    resolve(null);
                } else {
                    resolve(tempFilePath);
                }
            });
        } else if (process.platform === 'win32') {
            // Windows: 使用 PowerShell
            const script = `
                Add-Type -AssemblyName System.Windows.Forms
                $img = [System.Windows.Forms.Clipboard]::GetImage()
                if ($img -ne $null) {
                    $img.Save('${tempFilePath.replace(/\\/g, '\\\\')}')
                    Write-Output "success"
                } else {
                    Write-Output "no image"
                }
            `;
            
            exec(`powershell -command "${script}"`, (error, stdout) => {
                if (error || stdout.trim() !== 'success') {
                    resolve(null);
                } else {
                    resolve(tempFilePath);
                }
            });
        } else {
            // Linux: 使用 xclip
            exec(`xclip -selection clipboard -t image/png -o > "${tempFilePath}"`, (error) => {
                if (error) {
                    resolve(null);
                } else {
                    fs.stat(tempFilePath, (err, stats) => {
                        if (err || stats.size === 0) {
                            resolve(null);
                        } else {
                            resolve(tempFilePath);
                        }
                    });
                }
            });
        }
    });
}

/**
 * 从 DataTransfer 保存图片到临时文件
 */
async function saveDataTransferImageToFile(dataTransfer: vscode.DataTransfer): Promise<string | null> {
    const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];
    
    for (const mimeType of imageTypes) {
        const item = dataTransfer.get(mimeType);
        if (item) {
            try {
                const file = item.asFile();
                if (file) {
                    const data = await file.data();
                    if (data && data.byteLength > 0) {
                        const ext = mimeType.split('/')[1] || 'png';
                        const tempDir = os.tmpdir();
                        const tempFileName = `vscode_picgo_${Date.now()}.${ext}`;
                        const tempFilePath = path.join(tempDir, tempFileName);
                        
                        fs.writeFileSync(tempFilePath, Buffer.from(data));
                        return tempFilePath;
                    }
                }
            } catch (e) {
                console.error('Failed to read image from DataTransfer:', e);
            }
        }
    }
    
    return null;
}

/**
 * 调用 picgo 上传图片
 */
async function uploadWithPicgo(imagePath: string): Promise<string | null> {
    const config = getConfig();
    const picgoPath = config.picgoPath;

    return new Promise((resolve) => {
        const picgo = spawn(picgoPath, ['upload', imagePath]);
        
        let stdout = '';
        let stderr = '';

        picgo.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        picgo.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        picgo.on('close', (code) => {
            if (code === 0) {
                // picgo 成功时会输出上传后的 URL
                const urlMatch = stdout.match(/https?:\/\/[^\s\]\n]+/);
                if (urlMatch) {
                    resolve(urlMatch[0].trim());
                } else {
                    const trimmedOutput = stdout.trim();
                    if (trimmedOutput.startsWith('http')) {
                        resolve(trimmedOutput.split('\n')[0].trim());
                    } else {
                        console.log('PicGo output:', stdout);
                        resolve(null);
                    }
                }
            } else {
                console.error('PicGo error:', stderr);
                resolve(null);
            }
        });

        picgo.on('error', (err) => {
            console.error('Failed to start PicGo:', err);
            resolve(null);
        });
    });
}

/**
 * 在编辑器中插入 Markdown 图片链接
 */
async function insertMarkdownImage(editor: vscode.TextEditor, imageUrl: string) {
    const selection = editor.selection;
    const selectedText = editor.document.getText(selection);
    
    const altText = selectedText || 'image';
    const markdownImage = `![${altText}](${imageUrl})`;

    await editor.edit((editBuilder) => {
        if (selection.isEmpty) {
            editBuilder.insert(selection.active, markdownImage);
        } else {
            editBuilder.replace(selection, markdownImage);
        }
    });
}

/**
 * 上传剪贴板图片的主函数（手动触发）
 */
async function uploadClipboardImage() {
    const editor = vscode.window.activeTextEditor;
    
    if (!editor) {
        vscode.window.showWarningMessage('No active editor found');
        return;
    }

    if (editor.document.languageId !== 'markdown') {
        vscode.window.showWarningMessage('PicGo Paste only works in Markdown files');
        return;
    }

    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: 'Uploading image...',
            cancellable: false
        },
        async () => {
            try {
                const tempImagePath = await saveClipboardImageToFile();
                
                if (!tempImagePath) {
                    vscode.window.showWarningMessage('No image found in clipboard');
                    return;
                }

                const imageUrl = await uploadWithPicgo(tempImagePath);
                
                try {
                    fs.unlinkSync(tempImagePath);
                } catch (e) {
                    // 忽略清理错误
                }

                if (!imageUrl) {
                    vscode.window.showErrorMessage('Failed to upload image with PicGo. Please check your PicGo configuration.');
                    return;
                }

                await insertMarkdownImage(editor, imageUrl);
                vscode.window.showInformationMessage('Image uploaded successfully!');
                
            } catch (error) {
                vscode.window.showErrorMessage(`Error: ${error}`);
            }
        }
    );
}

/**
 * DocumentPasteEditProvider - 实现粘贴时自动上传
 * 这是 VSCode 1.82+ 的官方 API，可以拦截粘贴操作
 */
class PicgoPasteEditProvider implements vscode.DocumentPasteEditProvider {
    
    private static readonly kind = vscode.DocumentDropOrPasteEditKind.Empty.append('picgo', 'upload');

    async provideDocumentPasteEdits(
        document: vscode.TextDocument,
        ranges: readonly vscode.Range[],
        dataTransfer: vscode.DataTransfer,
        context: vscode.DocumentPasteEditContext,
        token: vscode.CancellationToken
    ): Promise<vscode.DocumentPasteEdit[] | undefined> {
        
        const config = getConfig();
        
        if (!config.autoUploadOnPaste) {
            return undefined;
        }

        // 检查是否有图片
        let hasImage = false;
        for (const [mimeType] of dataTransfer) {
            if (mimeType.startsWith('image/')) {
                hasImage = true;
                break;
            }
        }

        if (!hasImage) {
            return undefined;
        }

        // 检查是否已取消
        if (token.isCancellationRequested) {
            return undefined;
        }

        // 从 DataTransfer 获取图片并保存
        let tempImagePath = await saveDataTransferImageToFile(dataTransfer);
        
        // 如果 DataTransfer 没有图片数据，尝试从系统剪贴板获取
        if (!tempImagePath) {
            tempImagePath = await saveClipboardImageToFile();
        }

        if (!tempImagePath) {
            return undefined;
        }

        // 显示上传状态
        const imageUrl = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Uploading image to PicGo...',
                cancellable: false
            },
            async () => {
                const result = await uploadWithPicgo(tempImagePath!);
                
                // 清理临时文件
                try {
                    fs.unlinkSync(tempImagePath!);
                } catch (e) {
                    // 忽略
                }

                return result;
            }
        );

        if (!imageUrl) {
            vscode.window.showErrorMessage('Failed to upload image with PicGo');
            return undefined;
        }

        // 创建 Markdown 图片链接
        const markdownImage = `![image](${imageUrl})`;
        
        // 创建粘贴编辑（新 API 需要 3 个参数：insertText, title, kind）
        const pasteEdit = new vscode.DocumentPasteEdit(
            markdownImage,
            'Upload with PicGo',
            PicgoPasteEditProvider.kind
        );
        
        vscode.window.showInformationMessage('Image uploaded successfully!');
        
        return [pasteEdit];
    }
}

/**
 * 扩展激活时调用
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('PicGo Paste extension is now active!');

    // 注册手动上传命令 (Cmd+Alt+V)
    const uploadCommand = vscode.commands.registerCommand(
        'picgo-paste.uploadFromClipboard',
        uploadClipboardImage
    );
    context.subscriptions.push(uploadCommand);

    // 注册 DocumentPasteEditProvider
    // 这是 VSCode 官方的粘贴拦截 API，当粘贴图片时会自动触发
    const selector: vscode.DocumentSelector = { language: 'markdown' };
    
    const pasteProvider = vscode.languages.registerDocumentPasteEditProvider(
        selector,
        new PicgoPasteEditProvider(),
        {
            providedPasteEditKinds: [
                vscode.DocumentDropOrPasteEditKind.Empty.append('picgo', 'upload')
            ],
            pasteMimeTypes: ['image/*', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
        }
    );
    context.subscriptions.push(pasteProvider);

    console.log('PicGo Paste: DocumentPasteEditProvider registered for Markdown files');
}

/**
 * 扩展停用时调用
 */
export function deactivate() {}

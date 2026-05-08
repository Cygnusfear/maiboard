import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { homedir } from "node:os";
import { join, posix, win32 } from "node:path";
import * as vscode from "vscode";

const MAX_REQUEST_BYTES = 4 * 1024 * 1024;
const BRIDGE_DIR = join(homedir(), ".pi");
const BRIDGE_FILE = join(BRIDGE_DIR, "vscode-bridge.json");

type RpcParams = Record<string, unknown>;

interface RpcRequest {
  method?: string;
  params?: RpcParams;
}

interface BridgeInfo {
  url: string;
  token: string;
  dispose(): Promise<void>;
}

class PayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeds ${limit} bytes`);
  }
}

export async function startVscodeBridge(context: vscode.ExtensionContext): Promise<BridgeInfo> {
  const token = randomUUID();
  const decorations = new Set<vscode.TextEditorDecorationType>();
  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.url !== "/rpc") {
        sendJson(response, 404, { error: "Not found" });
        return;
      }
      if (request.headers["x-pi-vscode-authorization"] !== token) {
        sendJson(response, 401, { error: "Unauthorized" });
        return;
      }

      const body = await readJson(request);
      const rpc = isRpcRequest(body) ? body : undefined;
      if (!rpc?.method) {
        sendJson(response, 400, { error: "Invalid RPC request" });
        return;
      }

      const result = await handleRpc(rpc.method, rpc.params ?? {}, decorations);
      sendJson(response, 200, { result });
    } catch (error) {
      const status = error instanceof PayloadTooLargeError ? 413 : 500;
      sendJson(response, status, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Failed to bind VS Code bridge");

  const url = `http://127.0.0.1:${address.port}`;
  writeBridgeFile({ url, token });

  const disposable = new vscode.Disposable(() => {
    for (const decoration of decorations) decoration.dispose();
    decorations.clear();
  });
  context.subscriptions.push(disposable);

  return {
    url,
    token,
    dispose: async () => {
      disposable.dispose();
      removeBridgeFile(token);
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

async function handleRpc(
  method: string,
  params: RpcParams,
  decorations: Set<vscode.TextEditorDecorationType>,
): Promise<unknown> {
  switch (method) {
    case "openFile":
    case "editorOpen":
      return openFile(params);
    case "getEditorState":
    case "editorState":
      return getEditorState();
    case "revealFile":
    case "revealInExplorer":
      return revealFile(params);
    case "highlightLines":
    case "editorHighlight":
      return highlightLines(params, decorations);
    case "showNotification":
      return showNotification(params);
    default:
      throw new Error(`Unknown bridge method: ${method}`);
  }
}

async function openFile(params: RpcParams) {
  const uri = fileUri(params);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, {
    preview: readBoolean(params.preview) ?? true,
    preserveFocus: readBoolean(params.preserveFocus) ?? false,
  });

  const range = readSelection(params) ?? readLineRange(params);
  if (range) {
    editor.selection = new vscode.Selection(range.start, range.end);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
  }

  return {
    opened: true,
    filePath: uri.fsPath,
    fileUri: uri.toString(),
    selection: captureSelection(editor),
  };
}

function getEditorState() {
  const activeEditor = vscode.window.activeTextEditor;
  return {
    workspaceFolders: workspaceFolders(),
    activeEditor: activeEditor ? editorInfo(activeEditor) : undefined,
    currentSelection: captureSelection(activeEditor),
    openEditors: openEditors(),
  };
}

async function revealFile(params: RpcParams) {
  const uri = fileUri(params);
  await vscode.commands.executeCommand("revealInExplorer", uri);
  return { revealed: true, filePath: uri.fsPath, fileUri: uri.toString() };
}

async function highlightLines(
  params: RpcParams,
  decorations: Set<vscode.TextEditorDecorationType>,
): Promise<unknown> {
  const uri = fileUri(params);
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, { preview: true });
  const startLine = Math.max(0, Math.floor(readNumber(params.line) ?? 1) - 1);
  const endLine = Math.max(startLine, Math.floor(readNumber(params.endLine) ?? startLine + 1) - 1);
  const range = new vscode.Range(
    startLine,
    0,
    endLine,
    document.lineAt(endLine).range.end.character,
  );
  const decoration = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    overviewRulerColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
    overviewRulerLane: vscode.OverviewRulerLane.Full,
  });
  decorations.add(decoration);
  editor.setDecorations(decoration, [range]);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

  const duration = readNumber(params.highlightDurationMs) ?? 5000;
  if (duration > 0) {
    setTimeout(() => {
      editor.setDecorations(decoration, []);
      decoration.dispose();
      decorations.delete(decoration);
    }, duration);
  }

  return { highlighted: true, filePath: uri.fsPath, line: startLine + 1, endLine: endLine + 1 };
}

async function showNotification(params: RpcParams) {
  const message = readString(params.message) ?? "Maiboard notification";
  const type = readString(params.type) ?? "info";
  if (type === "error") await vscode.window.showErrorMessage(message);
  else if (type === "warning") await vscode.window.showWarningMessage(message);
  else await vscode.window.showInformationMessage(message);
  return { shown: true, type, message };
}

function fileUri(params: RpcParams): vscode.Uri {
  const filePath =
    readString(params.filePath) ?? readString(params.file) ?? readString(params.path);
  if (!filePath) throw new Error("Missing required parameter: filePath");
  return vscode.Uri.file(resolveFilePath(filePath));
}

function resolveFilePath(filePath: string): string {
  if (posix.isAbsolute(filePath) || win32.isAbsolute(filePath)) return filePath;
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root)
    throw new Error(`Cannot resolve relative path without a workspace folder: ${filePath}`);
  const pathApi = root.includes("\\") ? win32 : posix;
  return pathApi.resolve(root, filePath);
}

function readSelection(params: RpcParams): vscode.Range | undefined {
  const selection = params.selection;
  if (!selection || typeof selection !== "object") return undefined;
  const record = selection as RpcParams;
  const start = readPosition(record.start);
  const end = readPosition(record.end);
  return start && end ? new vscode.Range(start, end) : undefined;
}

function readLineRange(params: RpcParams): vscode.Range | undefined {
  const line = readNumber(params.line);
  if (line === undefined) return undefined;
  const column = readNumber(params.column) ?? 1;
  const endLine = readNumber(params.endLine) ?? line;
  const endColumn = readNumber(params.endColumn) ?? column;
  return new vscode.Range(
    Math.max(0, Math.floor(line) - 1),
    Math.max(0, Math.floor(column) - 1),
    Math.max(0, Math.floor(endLine) - 1),
    Math.max(0, Math.floor(endColumn) - 1),
  );
}

function readPosition(value: unknown): vscode.Position | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as RpcParams;
  const line = readNumber(record.line);
  const character = readNumber(record.character);
  if (line === undefined || character === undefined) return undefined;
  return new vscode.Position(line, character);
}

function captureSelection(editor: vscode.TextEditor | undefined) {
  if (!editor) return undefined;
  const { document, selection } = editor;
  return {
    text: document.getText(selection),
    isEmpty: selection.isEmpty,
    filePath: document.uri.fsPath,
    fileUri: document.uri.toString(),
    languageId: document.languageId,
    start: position(selection.start),
    end: position(selection.end),
  };
}

function editorInfo(editor: vscode.TextEditor) {
  return {
    filePath: editor.document.uri.fsPath,
    fileUri: editor.document.uri.toString(),
    languageId: editor.document.languageId,
    isDirty: editor.document.isDirty,
    viewColumn: editor.viewColumn,
    isActive:
      vscode.window.activeTextEditor?.document.uri.toString() === editor.document.uri.toString(),
  };
}

function openEditors() {
  const seen = new Map<string, ReturnType<typeof editorInfo>>();
  for (const editor of vscode.window.visibleTextEditors) {
    if (editor.document.uri.scheme === "file")
      seen.set(editor.document.uri.toString(), editorInfo(editor));
  }
  return [...seen.values()];
}

function workspaceFolders() {
  return (vscode.workspace.workspaceFolders ?? []).map((folder, index) => ({
    index,
    name: folder.name,
    filePath: folder.uri.fsPath,
    uri: folder.uri.toString(),
  }));
}

function position(value: vscode.Position) {
  return { line: value.line, character: value.character };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      request.destroy();
      throw new PayloadTooLargeError(MAX_REQUEST_BYTES);
    }
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as unknown) : {};
}

function isRpcRequest(value: unknown): value is RpcRequest {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function writeBridgeFile(info: { url: string; token: string }) {
  try {
    mkdirSync(BRIDGE_DIR, { recursive: true });
    writeFileSync(
      BRIDGE_FILE,
      JSON.stringify({
        ...info,
        owner: "maiboard",
        pid: process.pid,
        startedAt: new Date().toISOString(),
        workspace: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
      }),
    );
  } catch {
    // The bridge still works for this extension session even if discovery file writing fails.
  }
}

function removeBridgeFile(token: string) {
  try {
    if (!existsSync(BRIDGE_FILE)) return;
    const current = JSON.parse(readFileSync(BRIDGE_FILE, "utf8")) as { token?: string };
    if (current.token === token) unlinkSync(BRIDGE_FILE);
  } catch {
    // Best-effort cleanup only.
  }
}

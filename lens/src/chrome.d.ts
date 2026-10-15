/**
 * The few extension APIs the lens uses, typed here so the lens typechecks
 * without adding @types/chrome to the workspace. Signatures follow the
 * Chrome extension reference (Manifest V3, promise forms).
 */

declare namespace chrome {
  namespace runtime {
    const id: string;
    const lastError: { message?: string } | undefined;
    function getURL(path: string): string;
    function openOptionsPage(): Promise<void>;
    function sendMessage<T = unknown>(message: unknown, callback: (response: T | undefined) => void): void;
    interface MessageSender {
      id?: string;
      tab?: tabs.Tab;
    }
    const onMessage: {
      addListener(
        listener: (message: any, sender: MessageSender, sendResponse: (response: any) => void) => boolean | undefined | void,
      ): void;
    };
  }
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      windowId?: number;
    }
    function captureVisibleTab(windowId: number | undefined, options: { format: 'png' | 'jpeg'; quality?: number }): Promise<string>;
    function query(info: { active?: boolean; lastFocusedWindow?: boolean; currentWindow?: boolean }): Promise<Tab[]>;
    const onUpdated: {
      addListener(listener: (tabId: number, change: { status?: string }, tab: Tab) => void): void;
    };
  }
  namespace scripting {
    interface InjectionResult<T> {
      result?: T;
    }
    function executeScript<T>(injection: {
      target: { tabId: number; allFrames?: boolean };
      files?: string[];
      func?: () => T;
    }): Promise<InjectionResult<T>[]>;
  }
  namespace action {
    function setBadgeText(details: { tabId?: number; text: string }): Promise<void>;
    function getBadgeText(details: { tabId?: number }): Promise<string>;
    const onClicked: { addListener(listener: (tab: tabs.Tab) => void): void };
  }
  namespace permissions {
    function contains(permissions: { origins: string[] }): Promise<boolean>;
    function request(permissions: { origins: string[] }): Promise<boolean>;
    function remove(permissions: { origins: string[] }): Promise<boolean>;
  }
  namespace offscreen {
    function createDocument(parameters: { url: string; reasons: string[]; justification: string }): Promise<void>;
  }
  namespace commands {
    const onCommand: { addListener(listener: (command: string, tab?: tabs.Tab) => void): void };
  }
}

/** True in the test build (lens/build.mjs --test): the browser check may point translation at its own server. */
declare const __LENS_TEST__: boolean;

/** esbuild's `text` loader (lens/build.mjs) imports a .tsv file as a string. */
declare module '*.tsv' {
  const text: string;
  export default text;
}

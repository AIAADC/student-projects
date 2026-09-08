/**
 * Agent 会话:useChat + 本机 /api/agent/chat。服务端无状态;
 * UIMessage[] 存 localStorage(v2,不迁旧 Wire 会话)。
 */

import { useCallback, useEffect, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import type { WritePolicy } from "./types.js";

const agentTransport = new DefaultChatTransport({ api: "/api/agent/chat" });

const STORAGE_KEY = "skills-hub.agent.v2";
const MODEL_KEY = "skills-hub.agent.model";
const POLICY_KEY = "skills-hub.agent.writePolicy";

function loadMessages(): UIMessage[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as UIMessage[]) : [];
  } catch {
    return [];
  }
}

function loadStoredModel(): string {
  try {
    return localStorage.getItem(MODEL_KEY) ?? "";
  } catch {
    return "";
  }
}

function loadWritePolicy(): WritePolicy {
  try {
    return localStorage.getItem(POLICY_KEY) === "allow" ? "allow" : "ask";
  } catch {
    return "ask";
  }
}

export interface UseAgentChat {
  messages: UIMessage[];
  busy: boolean;
  errorText: string | null;
  model: string;
  setModel: (model: string) => void;
  writePolicy: WritePolicy;
  setWritePolicy: (policy: WritePolicy) => void;
  applyModelDefault: (fallback: string, allowed: string[]) => void;
  send: (text: string) => void;
  stop: () => void;
  reset: () => void;
  approve: (approvalId: string) => void;
  deny: (approvalId: string) => void;
}

export function useAgentChat(): UseAgentChat {
  const [model, setModelState] = useState<string>(loadStoredModel);
  const [writePolicy, setWritePolicyState] = useState<WritePolicy>(loadWritePolicy);
  const { messages, sendMessage, stop, status, error, setMessages, addToolApprovalResponse } = useChat({
    transport: agentTransport,
    messages: loadMessages(),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // 存储满等静默
    }
  }, [messages]);

  const setModel = useCallback((next: string) => {
    setModelState(next);
    try {
      localStorage.setItem(MODEL_KEY, next);
    } catch {
      // 静默
    }
  }, []);

  const setWritePolicy = useCallback((next: WritePolicy) => {
    setWritePolicyState(next);
    try {
      localStorage.setItem(POLICY_KEY, next);
    } catch {
      // 静默
    }
  }, []);

  const applyModelDefault = useCallback((fallback: string, allowed: string[]) => {
    setModelState((prev) => {
      const next = prev !== "" && allowed.includes(prev) ? prev : fallback;
      try {
        localStorage.setItem(MODEL_KEY, next);
      } catch {
        // 静默
      }
      return next;
    });
  }, []);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "" || status === "streaming" || status === "submitted") return;
      void sendMessage({ text: trimmed }, { body: { model, writePolicy } });
    },
    [sendMessage, status, model, writePolicy],
  );

  const reset = useCallback(() => {
    void stop();
    setMessages([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 静默
    }
  }, [stop, setMessages]);

  const approve = useCallback(
    (approvalId: string) => {
      void addToolApprovalResponse({ id: approvalId, approved: true, options: { body: { model, writePolicy } } });
    },
    [addToolApprovalResponse, model, writePolicy],
  );

  const deny = useCallback(
    (approvalId: string) => {
      void addToolApprovalResponse({
        id: approvalId,
        approved: false,
        reason: "用户拒绝",
        options: { body: { model, writePolicy } },
      });
    },
    [addToolApprovalResponse, model, writePolicy],
  );

  return {
    messages,
    busy: status === "submitted" || status === "streaming",
    errorText: error instanceof Error ? error.message : error !== undefined ? String(error) : null,
    model,
    setModel,
    writePolicy,
    setWritePolicy,
    applyModelDefault,
    send,
    stop: () => {
      void stop();
    },
    reset,
    approve,
    deny,
  };
}

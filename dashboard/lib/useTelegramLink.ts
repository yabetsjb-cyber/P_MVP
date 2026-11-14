import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, ApiError } from '@/lib/api';

export interface TelegramLink {
  chatId: string;
  label: string | null;
  linkedAt: string;
  linkedBy: string | null;
}

interface LinksResponse {
  botConfigured: boolean;
  links: TelegramLink[];
}

interface GeneratedLink {
  token: string;
  url: string | null;
  expiresAt: string;
}

export interface UseTelegramLink {
  // current state
  links: TelegramLink[];
  botConfigured: boolean;
  isLoading: boolean;
  error: ApiError | null;

  // connect flow
  dialogOpen: boolean;
  generating: boolean;
  generatedLink: GeneratedLink | null;
  generateError: string | null;
  secondsUntilExpiry: number;
  openDialog: () => Promise<void>;
  closeDialog: () => void;

  // disconnect flow
  disconnectTarget: TelegramLink | null;
  setDisconnectTarget: (link: TelegramLink | null) => void;
  disconnecting: boolean;
  disconnectError: string | null;
  confirmDisconnect: () => Promise<void>;

  // test alert
  testState: 'idle' | 'sending' | 'sent' | 'error';
  sendTest: () => Promise<void>;
}

export function useTelegramLink(enabled: boolean): UseTelegramLink {
  const queryClient = useQueryClient();

  const linksQuery = useQuery({
    queryKey: ['telegram-links'],
    queryFn: () => api<LinksResponse>('/v1/pharmacy/telegram'),
    enabled,
    staleTime: 30_000,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<GeneratedLink | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [initialChatIds, setInitialChatIds] = useState<Set<string>>(new Set());

  const [disconnectTarget, setDisconnectTarget] = useState<TelegramLink | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [disconnectError, setDisconnectError] = useState<string | null>(null);

  const [testState, setTestState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const links = linksQuery.data?.ok ? linksQuery.data.data.links : [];
  const botConfigured = linksQuery.data?.ok ? linksQuery.data.data.botConfigured : false;
  const isLoading = linksQuery.isLoading;
  const error = linksQuery.data && !linksQuery.data.ok ? linksQuery.data.error : null;

  // 1-second ticker while dialog is open, to drive the countdown.
  useEffect(() => {
    if (!dialogOpen) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [dialogOpen]);

  // 3-second poll of the links endpoint while dialog is open.
  useEffect(() => {
    if (!dialogOpen) return;
    const refetch = linksQuery.refetch;
    const id = setInterval(() => {
      void refetch();
    }, 3000);
    return () => clearInterval(id);
  }, [dialogOpen, linksQuery.refetch]);

  // Auto-close the dialog once a chat that was not present when the dialog
  // opened shows up. That is the moment the user tapped Start in Telegram.
  useEffect(() => {
    if (!dialogOpen) return;
    const hasNew = links.some((l) => !initialChatIds.has(l.chatId));
    if (hasNew) {
      setDialogOpen(false);
      setGeneratedLink(null);
      setInitialChatIds(new Set());
    }
  }, [dialogOpen, links, initialChatIds]);

  const openDialog = useCallback(async () => {
    setGenerateError(null);
    setGeneratedLink(null);
    setDialogOpen(true);
    setInitialChatIds(new Set(links.map((l) => l.chatId)));
    setGenerating(true);
    setNow(Date.now());

    const res = await api<GeneratedLink>(
      '/v1/pharmacy/telegram/link-token',
      { method: 'POST' },
    );

    setGenerating(false);

    if (!res.ok) {
      setGenerateError(errorMessage(res.error));
      return;
    }
    setGeneratedLink(res.data);
    setNow(Date.now());
  }, [links]);

  const closeDialog = useCallback(() => {
    if (generating) return;
    setDialogOpen(false);
    setGeneratedLink(null);
    setGenerateError(null);
  }, [generating]);

  const confirmDisconnect = useCallback(async () => {
    if (!disconnectTarget) return;
    setDisconnecting(true);
    setDisconnectError(null);

    const res = await api(
      `/v1/pharmacy/telegram/${disconnectTarget.chatId}`,
      { method: 'DELETE' },
    );

    setDisconnecting(false);

    if (!res.ok) {
      setDisconnectError(errorMessage(res.error));
      return;
    }

    setDisconnectTarget(null);
    await queryClient.invalidateQueries({ queryKey: ['telegram-links'] });
  }, [disconnectTarget, queryClient]);

  const sendTest = useCallback(async () => {
    setTestState('sending');
    const res = await api<{ queuedTo: number }>(
      '/v1/pharmacy/telegram/test',
      { method: 'POST' },
    );

    if (!res.ok) {
      setTestState('error');
      setTimeout(() => setTestState('idle'), 4000);
      return;
    }

    setTestState('sent');
    setTimeout(() => setTestState('idle'), 4000);
  }, []);

  const secondsUntilExpiry = generatedLink
    ? Math.max(0, Math.floor((new Date(generatedLink.expiresAt).getTime() - now) / 1000))
    : 0;

  return {
    links,
    botConfigured,
    isLoading,
    error,

    dialogOpen,
    generating,
    generatedLink,
    generateError,
    secondsUntilExpiry,
    openDialog,
    closeDialog,

    disconnectTarget,
    setDisconnectTarget,
    disconnecting,
    disconnectError,
    confirmDisconnect,

    testState,
    sendTest,
  };
}
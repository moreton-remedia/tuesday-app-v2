import { createPortal } from 'react-dom';
import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { orpcClient, orpcUtils } from '@/rpc/react';

interface WorkspaceSettingsProps {
  workspaceName: string;
  inviteToken: string;
  onClose: () => void;
}

export function WorkspaceSettings({ workspaceName, inviteToken, onClose }: WorkspaceSettingsProps) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const inviteLink = `${window.location.origin}/join/${inviteToken}`;

  // ── Name editing ────────────────────────────────────────────────────────────

  async function handleNameSave(newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === workspaceName) return;
    try {
      await orpcClient.workspace.updateWorkspace({ name: trimmed });
      await Promise.all([
        qc.invalidateQueries(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} })),
        qc.invalidateQueries(orpcUtils.workspace.listWorkspaces.queryOptions({ input: {} })),
      ]);
    } catch {
      // Revert input on failure
      if (nameInputRef.current) nameInputRef.current.value = workspaceName;
    }
  }

  function handleNameBlur(e: React.FocusEvent<HTMLInputElement>) {
    const val = e.target.value.trim();
    if (val) handleNameSave(val);
    else if (nameInputRef.current) nameInputRef.current.value = workspaceName;
  }

  function handleNameKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur();
    if (e.key === 'Escape') {
      if (nameInputRef.current) nameInputRef.current.value = workspaceName;
      e.currentTarget.blur();
    }
  }

  // ── Invite link ─────────────────────────────────────────────────────────────

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = inviteLink;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleReset() {
    setResetting(true);
    try {
      await orpcClient.workspace.regenerateInviteToken({});
      await qc.invalidateQueries(orpcUtils.workspace.getWorkspace.queryOptions({ input: {} }));
      setShowConfirm(false);
    } finally {
      setResetting(false);
    }
  }

  // ── Keyboard / backdrop ─────────────────────────────────────────────────────

  function handleBackdropClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showConfirm) setShowConfirm(false);
        else onClose();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showConfirm, onClose]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      <div
        ref={panelRef}
        className="w-full max-w-md bg-app-s1 border border-app-ln rounded-xl shadow-2xl p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-app-t1">Workspace Settings</h2>
          <button
            onClick={onClose}
            className="text-app-t3 hover:text-app-t2 transition-colors flex items-center justify-center w-6 h-6"
            aria-label="Close"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l8 8M10 2l-8 8"/></svg>
          </button>
        </div>

        {/* Workspace name — inline editable */}
        <div className="mb-6">
          <p className="text-xs text-app-t3 uppercase tracking-wider mb-2">Workspace name</p>
          <input
            ref={nameInputRef}
            defaultValue={workspaceName}
            onBlur={handleNameBlur}
            onKeyDown={handleNameKeyDown}
            className="w-full bg-app-s2 border border-app-ln rounded-lg px-3 py-2 text-app-t1 text-sm focus:outline-none focus:border-app-ac transition-colors"
            aria-label="Workspace name"
          />
          <p className="text-xs text-app-t3/60 mt-1">Press Enter or click away to save.</p>
        </div>

        {/* Invite link */}
        <div>
          <p className="text-xs text-app-t3 uppercase tracking-wider mb-2">Invite link</p>
          <p className="text-xs text-app-t3 mb-3">
            Anyone with this link can join your workspace.
          </p>
          <div className="flex items-center gap-2 bg-app-s2 border border-app-ln rounded-lg px-3 py-2 mb-3">
            <span className="flex-1 text-xs text-app-t2 truncate font-mono">{inviteLink}</span>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 text-xs font-medium text-app-ac hover:text-app-ac/80 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <button
            onClick={() => setShowConfirm(true)}
            className="text-xs text-app-t3 hover:text-app-dg transition-colors"
          >
            Reset invitation link…
          </button>
        </div>
      </div>

      {/* Reset confirmation dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-60 flex items-center justify-center">
          <div className="w-full max-w-sm bg-app-s1 border border-app-ln rounded-xl shadow-2xl p-6 mx-4">
            <h3 className="text-base font-semibold text-app-t1 mb-2">Reset invitation link?</h3>
            <p className="text-sm text-app-t3 mb-6">
              The current link will stop working immediately. Anyone you've already shared it with will need the new link to join.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={resetting}
                className="px-4 py-2 text-sm text-app-t3 hover:text-app-t1 transition-colors rounded-lg hover:bg-app-s2"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="px-4 py-2 text-sm font-medium bg-app-dg hover:bg-app-dg/90 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                {resetting ? 'Resetting…' : 'Reset link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

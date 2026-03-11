'use client';

/**
 * Workflows — Linear-style workflow management for data governance requests.
 *
 * Supports five workflow types seeded in the DB:
 *   access_request | certification | classification_review | deprecation | policy_exception
 *
 * Design: Linear issue-tracker aesthetic — flat table rows, status pills,
 * priority dots, slide-over detail panel. No cards, no accordion mess.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api-client';
import { format, formatDistanceToNow } from 'date-fns';
import {
  Key, ShieldCheck, Tag, Archive, AlertTriangle,
  CheckCircle2, XCircle, Clock, MoreHorizontal, Plus,
  ChevronRight, X, Send, User, Calendar, Search,
  Loader2, MessageSquare,
  ExternalLink, RotateCcw, UserCheck,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type WorkflowType = 'access_request' | 'certification' | 'classification_review' | 'deprecation' | 'policy_exception';
type WorkflowStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled';
type Priority = 'high' | 'medium' | 'normal';

interface WorkflowEvent {
  id: string;
  event_type: 'created' | 'assigned' | 'comment' | 'status_change' | 'approved' | 'rejected';
  actor: string;
  actor_email?: string;
  content?: string;
  from_status?: WorkflowStatus;
  to_status?: WorkflowStatus;
  created_at: string;
}

interface WorkflowInstance {
  id: string;
  workflow_type: WorkflowType;
  title: string;
  description?: string;
  asset_urn?: string;
  status: WorkflowStatus;
  priority: Priority;
  requester: string;
  requester_email?: string;
  assigned_to?: string;
  assigned_to_email?: string;
  due_date?: string;
  created_at: string;
  updated_at: string;
  events?: WorkflowEvent[];
}

// ─── Workflow type metadata ───────────────────────────────────────────────────

const WORKFLOW_TYPES: Record<WorkflowType, {
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  iconColor: string;
  iconBg: string;
}> = {
  access_request: {
    label: 'Access Request',
    description: 'Request access to a data asset',
    Icon: Key,
    iconColor: 'text-blue-600',
    iconBg: 'bg-blue-50',
  },
  certification: {
    label: 'Certification',
    description: 'Submit asset for certification review',
    Icon: ShieldCheck,
    iconColor: 'text-green-600',
    iconBg: 'bg-green-50',
  },
  classification_review: {
    label: 'Classification Review',
    description: 'Request data classification update',
    Icon: Tag,
    iconColor: 'text-orange-600',
    iconBg: 'bg-orange-50',
  },
  deprecation: {
    label: 'Deprecation',
    description: 'Propose asset deprecation',
    Icon: Archive,
    iconColor: 'text-red-600',
    iconBg: 'bg-red-50',
  },
  policy_exception: {
    label: 'Policy Exception',
    description: 'Request policy exception',
    Icon: AlertTriangle,
    iconColor: 'text-amber-600',
    iconBg: 'bg-amber-50',
  },
};

const WORKFLOW_TYPE_LIST = Object.entries(WORKFLOW_TYPES) as [WorkflowType, typeof WORKFLOW_TYPES[WorkflowType]][];

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: WorkflowStatus }) {
  const map: Record<WorkflowStatus, { label: string; cls: string }> = {
    pending:   { label: 'Pending',   cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    in_review: { label: 'In Review', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    approved:  { label: 'Approved',  cls: 'bg-green-50 text-green-700 border-green-200' },
    rejected:  { label: 'Rejected',  cls: 'bg-red-50 text-red-700 border-red-200' },
    cancelled: { label: 'Cancelled', cls: 'bg-gray-100 text-gray-500 border-gray-200' },
  };
  const { label, cls } = map[status] || map.pending;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {label}
    </span>
  );
}

// ─── Priority dot ─────────────────────────────────────────────────────────────

function PriorityDot({ priority }: { priority: Priority }) {
  const map: Record<Priority, { color: string; label: string }> = {
    high:   { color: 'bg-red-500',   label: 'High' },
    medium: { color: 'bg-amber-400', label: 'Medium' },
    normal: { color: 'bg-gray-300',  label: 'Normal' },
  };
  const { color, label } = map[priority] || map.normal;
  return (
    <span title={label} className={`inline-block w-2 h-2 rounded-full shrink-0 ${color}`} />
  );
}

// ─── Type icon badge ──────────────────────────────────────────────────────────

function WorkflowTypeIcon({ type, size = 14 }: { type: WorkflowType; size?: number }) {
  const meta = WORKFLOW_TYPES[type];
  if (!meta) return null;
  const { Icon, iconColor, iconBg } = meta;
  return (
    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md ${iconBg}`}>
      <Icon size={size} className={iconColor} />
    </span>
  );
}

// ─── Row action menu ──────────────────────────────────────────────────────────

function RowMenu({ workflow, onAction }: {
  workflow: WorkflowInstance;
  onAction: (action: 'approve' | 'reject' | 'reassign' | 'view' | 'comment') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const canApprove = workflow.status === 'pending' || workflow.status === 'in_review';

  return (
    <div ref={ref} className="relative">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors opacity-0 group-hover:opacity-100"
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
          <button
            onClick={() => { onAction('view'); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <ExternalLink size={13} className="text-gray-400" /> View details
          </button>
          {canApprove && (
            <>
              <button
                onClick={() => { onAction('approve'); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-green-700 hover:bg-green-50 flex items-center gap-2"
              >
                <CheckCircle2 size={13} className="text-green-500" /> Approve
              </button>
              <button
                onClick={() => { onAction('reject'); setOpen(false); }}
                className="w-full text-left px-3 py-2 text-sm text-red-700 hover:bg-red-50 flex items-center gap-2"
              >
                <XCircle size={13} className="text-red-500" /> Reject
              </button>
            </>
          )}
          <button
            onClick={() => { onAction('reassign'); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <UserCheck size={13} className="text-gray-400" /> Reassign
          </button>
          <button
            onClick={() => { onAction('comment'); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
          >
            <MessageSquare size={13} className="text-gray-400" /> Add comment
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Timeline event ───────────────────────────────────────────────────────────

function TimelineEvent({ event }: { event: WorkflowEvent }) {
  const iconMap: Record<WorkflowEvent['event_type'], React.ReactNode> = {
    created:      <Plus size={12} className="text-blue-600" />,
    assigned:     <UserCheck size={12} className="text-blue-600" />,
    comment:      <MessageSquare size={12} className="text-gray-500" />,
    status_change:<RotateCcw size={12} className="text-amber-500" />,
    approved:     <CheckCircle2 size={12} className="text-green-600" />,
    rejected:     <XCircle size={12} className="text-red-500" />,
  };

  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
        {iconMap[event.event_type] || <Clock size={12} className="text-gray-400" />}
      </div>
      <div className="flex-1 min-w-0 pb-4">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-900">{event.actor}</span>
          {event.event_type === 'comment' && (
            <span className="text-xs text-gray-500">commented</span>
          )}
          {event.event_type === 'created' && (
            <span className="text-xs text-gray-500">created this workflow</span>
          )}
          {event.event_type === 'assigned' && (
            <span className="text-xs text-gray-500">
              assigned to <span className="font-medium text-gray-700">{event.content}</span>
            </span>
          )}
          {event.event_type === 'status_change' && (
            <span className="text-xs text-gray-500 flex items-center gap-1 flex-wrap">
              changed status from{' '}
              {event.from_status && <StatusPill status={event.from_status} />}
              {' '}to{' '}
              {event.to_status && <StatusPill status={event.to_status} />}
            </span>
          )}
          {event.event_type === 'approved' && (
            <span className="text-xs text-green-700 font-medium">approved this workflow</span>
          )}
          {event.event_type === 'rejected' && (
            <span className="text-xs text-red-700 font-medium">rejected this workflow</span>
          )}
          <span className="text-xs text-gray-400 ml-auto shrink-0">
            {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
          </span>
        </div>
        {event.content && event.event_type === 'comment' && (
          <div className="mt-1.5 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 whitespace-pre-wrap">
            {event.content}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Workflow detail slide-over ────────────────────────────────────────────────

function WorkflowSlideOver({
  workflow,
  onClose,
  onApprove,
  onReject,
  onComment,
}: {
  workflow: WorkflowInstance;
  onClose: () => void;
  onApprove: (id: string, comment: string) => Promise<void>;
  onReject: (id: string, comment: string) => Promise<void>;
  onComment: (id: string, content: string) => Promise<void>;
}) {
  const [comment, setComment] = useState('');
  const [actionMode, setActionMode] = useState<'comment' | 'approve' | 'reject' | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const commentRef = useRef<HTMLTextAreaElement>(null);
  const meta = WORKFLOW_TYPES[workflow.workflow_type];

  const handleSubmit = async () => {
    if (!comment.trim() && actionMode !== 'approve') return;
    setSubmitting(true);
    try {
      if (actionMode === 'approve') await onApprove(workflow.id, comment);
      else if (actionMode === 'reject') await onReject(workflow.id, comment);
      else await onComment(workflow.id, comment);
      setComment('');
      setActionMode(null);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit();
  };

  const canAct = workflow.status === 'pending' || workflow.status === 'in_review';

  // Synthetic events if none from API
  const events: WorkflowEvent[] = workflow.events ?? [
    {
      id: 'synth-created',
      event_type: 'created',
      actor: workflow.requester,
      created_at: workflow.created_at,
    },
  ];

  return (
    <div className="fixed inset-0 z-40 flex items-stretch" onClick={onClose}>
      {/* Backdrop */}
      <div className="flex-1 bg-black/20" />
      {/* Panel — slides in from right */}
      <div
        className="w-[520px] bg-white shadow-2xl flex flex-col border-l border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-100">
          <div className={`w-9 h-9 rounded-lg ${meta.iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
            <meta.Icon size={18} className={meta.iconColor} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">{meta.label}</span>
              <StatusPill status={workflow.status} />
              <PriorityDot priority={workflow.priority} />
              <span className="text-xs text-gray-400">{workflow.priority} priority</span>
            </div>
            <h2 className="text-sm font-semibold text-gray-900 mt-0.5 leading-snug">{workflow.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            <X size={15} />
          </button>
        </div>

        {/* Meta grid */}
        <div className="px-5 py-3 border-b border-gray-100 grid grid-cols-2 gap-x-4 gap-y-2">
          <div className="flex items-center gap-2 text-xs">
            <User size={12} className="text-gray-400 shrink-0" />
            <span className="text-gray-500">Requester</span>
            <span className="font-medium text-gray-900 truncate">{workflow.requester}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <UserCheck size={12} className="text-gray-400 shrink-0" />
            <span className="text-gray-500">Assigned</span>
            <span className="font-medium text-gray-900 truncate">{workflow.assigned_to || '—'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Clock size={12} className="text-gray-400 shrink-0" />
            <span className="text-gray-500">Created</span>
            <span className="text-gray-700">{format(new Date(workflow.created_at), 'MMM d, yyyy')}</span>
          </div>
          {workflow.due_date && (
            <div className="flex items-center gap-2 text-xs">
              <Calendar size={12} className="text-gray-400 shrink-0" />
              <span className="text-gray-500">Due</span>
              <span className="text-gray-700">{format(new Date(workflow.due_date), 'MMM d, yyyy')}</span>
            </div>
          )}
          {workflow.asset_urn && (
            <div className="col-span-2 flex items-center gap-2 text-xs overflow-hidden">
              <ExternalLink size={12} className="text-gray-400 shrink-0" />
              <span className="text-gray-500 shrink-0">Asset</span>
              <a
                href={`/catalog/${encodeURIComponent(workflow.asset_urn)}`}
                className="text-blue-600 hover:underline font-mono truncate"
              >
                {workflow.asset_urn}
              </a>
            </div>
          )}
        </div>

        {/* Description */}
        {workflow.description && (
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-1.5">Description</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{workflow.description}</p>
          </div>
        )}

        {/* Timeline */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-4 flex items-center gap-1.5">
            <Clock size={11} /> Timeline
          </p>
          <div className="relative">
            {/* Connecting line */}
            <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-100" />
            <div className="space-y-0">
              {events.map(ev => <TimelineEvent key={ev.id} event={ev} />)}
            </div>
          </div>
        </div>

        {/* Action bar at bottom */}
        <div className="px-5 py-4 border-t border-gray-100 space-y-3">
          {canAct && !actionMode && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setActionMode('approve'); setTimeout(() => commentRef.current?.focus(), 50); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <CheckCircle2 size={13} /> Approve
              </button>
              <button
                onClick={() => { setActionMode('reject'); setTimeout(() => commentRef.current?.focus(), 50); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <XCircle size={13} /> Reject
              </button>
              <button
                onClick={() => { setActionMode('comment'); setTimeout(() => commentRef.current?.focus(), 50); }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                <MessageSquare size={13} /> Add Comment
              </button>
            </div>
          )}

          {actionMode && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {actionMode === 'approve' && (
                  <span className="text-xs font-semibold text-green-700 flex items-center gap-1">
                    <CheckCircle2 size={12} /> Approving
                  </span>
                )}
                {actionMode === 'reject' && (
                  <span className="text-xs font-semibold text-red-700 flex items-center gap-1">
                    <XCircle size={12} /> Rejecting
                  </span>
                )}
                {actionMode === 'comment' && (
                  <span className="text-xs font-semibold text-gray-600 flex items-center gap-1">
                    <MessageSquare size={12} /> Adding comment
                  </span>
                )}
                <button
                  onClick={() => { setActionMode(null); setComment(''); }}
                  className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>
              <div className="relative">
                <textarea
                  ref={commentRef}
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    actionMode === 'approve'
                      ? 'Add approval note (optional)… (⌘+Enter to submit)'
                      : actionMode === 'reject'
                      ? 'Explain why this is being rejected… (⌘+Enter to submit)'
                      : 'Write a comment… (⌘+Enter to submit)'
                  }
                  rows={3}
                  className="w-full px-3 py-2.5 pr-24 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
                <button
                  onClick={handleSubmit}
                  disabled={submitting || (!comment.trim() && actionMode !== 'approve')}
                  className={`absolute bottom-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors disabled:opacity-40 ${
                    actionMode === 'approve'
                      ? 'bg-green-600 text-white hover:bg-green-700'
                      : actionMode === 'reject'
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {submitting ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                  {actionMode === 'approve' ? 'Approve' : actionMode === 'reject' ? 'Reject' : 'Send'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── New Request modal ────────────────────────────────────────────────────────

function NewRequestModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [wfType, setWfType] = useState<WorkflowType | null>(null);
  const [title, setTitle] = useState('');
  const [assetUrn, setAssetUrn] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [assignTo, setAssignTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!wfType || !title.trim()) { setError('Workflow type and title are required'); return; }
    setSaving(true); setError('');
    try {
      await api.workflows.initiate({
        workflow_type: wfType,
        title: title.trim(),
        asset_urn: assetUrn.trim() || undefined,
        description: description.trim() || undefined,
        priority,
        assigned_to: assignTo.trim() || undefined,
        due_date: dueDate || undefined,
      });
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(
        (e as { response?: { data?: { error?: { message?: string } } } })
          ?.response?.data?.error?.message || 'Failed to create workflow request.'
      );
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Workflow Request</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Workflow type selector — radio cards */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Workflow Type <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {WORKFLOW_TYPE_LIST.map(([key, meta]) => (
                <button
                  key={key}
                  onClick={() => setWfType(key)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                    wfType === key
                      ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg ${meta.iconBg} flex items-center justify-center shrink-0`}>
                    <meta.Icon size={16} className={meta.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{meta.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
                  </div>
                  {wfType === key && <CheckCircle2 size={16} className="text-blue-600 shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          {/* Fields — shown after type selection */}
          {wfType && (
            <>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder={
                    wfType === 'access_request'       ? 'Request read access to analytics schema' :
                    wfType === 'certification'         ? 'Certify revenue_fact table for Q1 2026' :
                    wfType === 'classification_review' ? 'Reclassify customer_pii as Restricted' :
                    wfType === 'deprecation'           ? 'Deprecate legacy orders view' :
                    'Exception: allow raw PII in staging environment'
                  }
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Asset URN</label>
                <input
                  type="text"
                  value={assetUrn}
                  onChange={e => setAssetUrn(e.target.value)}
                  placeholder="urn:opengovern:snowflake:table:prod.analytics.revenue"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">The data asset this workflow applies to</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Description / Justification</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Explain the business reason and context for this request…"
                  rows={4}
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Priority</label>
                  <div className="flex items-center gap-1.5">
                    {(['high', 'medium', 'normal'] as Priority[]).map(p => (
                      <button
                        key={p}
                        onClick={() => setPriority(p)}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border capitalize transition-colors ${
                          priority === p
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-gray-200 text-gray-600 hover:border-gray-300'
                        }`}
                      >
                        <PriorityDot priority={p} /> {p}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">Due date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={e => setDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">Assign to</label>
                <input
                  type="text"
                  value={assignTo}
                  onChange={e => setAssignTo(e.target.value)}
                  placeholder="user@company.com"
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
              <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 font-medium">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !wfType || !title.trim()}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {saving ? 'Creating…' : 'Create Request'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

type TabFilter = 'pending' | 'in_progress' | 'completed' | 'all';

const TAB_STATUS_MAP: Record<TabFilter, WorkflowStatus[] | null> = {
  pending:     ['pending'],
  in_progress: ['in_review'],
  completed:   ['approved', 'rejected', 'cancelled'],
  all:         null,
};

export default function WorkflowsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [typeFilter, setTypeFilter] = useState<WorkflowType | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<WorkflowInstance | null>(null);
  const [search, setSearch] = useState('');

  // Fetch all workflow instances. The backend accepts status/type params if needed.
  const { data, isLoading } = useQuery({
    queryKey: ['workflow-instances'],
    queryFn: () =>
      api.workflows.listInstances().then(r => (r.data?.data || []) as WorkflowInstance[]),
    refetchInterval: 30000,
  });
  const allWorkflows: WorkflowInstance[] = data || [];

  // Client-side filtering (fast for typical governance workloads < 1k items)
  const workflows = allWorkflows.filter(w => {
    const statuses = TAB_STATUS_MAP[activeTab];
    if (statuses && !statuses.includes(w.status)) return false;
    if (typeFilter && w.workflow_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !w.title.toLowerCase().includes(q) &&
        !w.requester.toLowerCase().includes(q) &&
        !(w.asset_urn || '').toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  // Tab counts
  const counts: Record<TabFilter, number> = {
    pending:     allWorkflows.filter(w => w.status === 'pending').length,
    in_progress: allWorkflows.filter(w => w.status === 'in_review').length,
    completed:   allWorkflows.filter(w => ['approved', 'rejected', 'cancelled'].includes(w.status)).length,
    all:         allWorkflows.length,
  };

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['workflow-instances'] });
  }, [queryClient]);

  // Mutations
  const approveMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.workflows.approve(id, comment),
    onSuccess: () => { invalidate(); setSelectedWorkflow(null); },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string }) =>
      api.workflows.reject(id, comment),
    onSuccess: () => { invalidate(); setSelectedWorkflow(null); },
  });

  const commentMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      api.workflows.comment(id, content),
    onSuccess: invalidate,
  });

  const handleApprove = useCallback(async (id: string, comment: string) => {
    await approveMutation.mutateAsync({ id, comment });
  }, [approveMutation]);

  const handleReject = useCallback(async (id: string, comment: string) => {
    await rejectMutation.mutateAsync({ id, comment });
  }, [rejectMutation]);

  const handleComment = useCallback(async (id: string, content: string) => {
    await commentMutation.mutateAsync({ id, content });
  }, [commentMutation]);

  const handleRowAction = useCallback((
    action: 'approve' | 'reject' | 'reassign' | 'view' | 'comment',
    workflow: WorkflowInstance
  ) => {
    if (action === 'view' || action === 'comment') {
      setSelectedWorkflow(workflow);
    } else if (action === 'approve') {
      if (confirm(`Approve "${workflow.title}"?`)) {
        approveMutation.mutate({ id: workflow.id, comment: '' });
      }
    } else if (action === 'reject') {
      const reason = prompt('Rejection reason:');
      if (reason !== null) {
        rejectMutation.mutate({ id: workflow.id, comment: reason });
      }
    }
    // 'reassign' would open a reassign dialog — left as view for now
  }, [approveMutation, rejectMutation]);

  const TABS: { key: TabFilter; label: string }[] = [
    { key: 'pending',     label: 'Pending Review' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed',   label: 'Completed' },
    { key: 'all',         label: 'All' },
  ];

  return (
    <div className="flex h-full min-h-0 gap-0 -mx-6 -mt-6">

      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <div className="w-52 shrink-0 border-r border-gray-100 flex flex-col py-5 px-3 gap-0.5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2.5 py-1 mb-1">
          View
        </p>
        {(['pending', 'in_progress', 'completed', 'all'] as TabFilter[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
              activeTab === tab ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <span>
              {tab === 'pending'     ? 'Pending' :
               tab === 'in_progress' ? 'In Progress' :
               tab === 'completed'   ? 'Completed' : 'All Workflows'}
            </span>
            {counts[tab] > 0 && (
              <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                activeTab === tab ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {counts[tab]}
              </span>
            )}
          </button>
        ))}

        <div className="mt-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2.5 py-1 mb-1">
            Type
          </p>
          <button
            onClick={() => setTypeFilter(null)}
            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !typeFilter ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            All types
          </button>
          {WORKFLOW_TYPE_LIST.map(([key, meta]) => (
            <button
              key={key}
              onClick={() => setTypeFilter(typeFilter === key ? null : key)}
              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors ${
                typeFilter === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <meta.Icon size={11} className={typeFilter === key ? 'text-blue-600' : 'text-gray-400'} />
              {meta.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main content ──────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Page header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Workflows</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Governance requests, approvals, and certifications
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={14} /> New Request
          </button>
        </div>

        {/* Tabs + search */}
        <div className="flex items-center justify-between px-6 border-b border-gray-100">
          <div className="flex items-center -mb-px">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
                {counts[tab.key] > 0 && (
                  <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                    activeTab === tab.key ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {counts[tab.key]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 py-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search workflows…"
                className="w-56 pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={18} className="animate-spin text-gray-400 mr-2" />
              <span className="text-sm text-gray-500">Loading workflows…</span>
            </div>
          ) : workflows.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                <CheckCircle2 size={24} className="text-gray-300" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                {search || typeFilter ? 'No matching workflows' : 'No workflows yet'}
              </h3>
              <p className="text-sm text-gray-400 max-w-xs">
                {search || typeFilter
                  ? 'Try adjusting your filters or search query.'
                  : 'Create your first governance workflow to get started.'}
              </p>
              {!search && !typeFilter && (
                <button
                  onClick={() => setShowNew(true)}
                  className="mt-5 flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors"
                >
                  <Plus size={14} /> Create your first workflow
                </button>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="w-8 px-4 py-2.5" />
                  {/* Type icon col */}
                  <th className="w-8 px-2 py-2.5" />
                  <th className="text-left px-2 py-2.5 text-xs font-semibold text-gray-400 min-w-0">Title</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 hidden lg:table-cell w-40">Asset</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 hidden md:table-cell w-32">Requester</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 hidden md:table-cell w-32">Assigned</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 w-24">Priority</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 hidden lg:table-cell w-20">Due</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-400 w-24">Status</th>
                  <th className="w-10 px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {workflows.map(wf => (
                  <tr
                    key={wf.id}
                    className="group hover:bg-gray-50/70 cursor-pointer transition-colors"
                    onClick={() => setSelectedWorkflow(wf)}
                  >
                    {/* Checkbox */}
                    <td className="w-8 px-4 py-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded border-gray-300 accent-blue-600 opacity-0 group-hover:opacity-100 cursor-pointer"
                      />
                    </td>
                    {/* Type icon */}
                    <td className="px-2 py-3">
                      <WorkflowTypeIcon type={wf.workflow_type} />
                    </td>
                    {/* Title */}
                    <td className="px-2 py-3 max-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{wf.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {WORKFLOW_TYPES[wf.workflow_type]?.label}
                        <span className="text-gray-300 mx-1">·</span>
                        {formatDistanceToNow(new Date(wf.created_at), { addSuffix: true })}
                      </p>
                    </td>
                    {/* Asset */}
                    <td className="px-4 py-3 hidden lg:table-cell max-w-0 w-40">
                      {wf.asset_urn ? (
                        <span className="text-xs font-mono text-gray-500 truncate block" title={wf.asset_urn}>
                          {wf.asset_urn.split(':').slice(-2).join('/')}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    {/* Requester */}
                    <td className="px-4 py-3 hidden md:table-cell w-32">
                      <span className="text-xs text-gray-600 truncate block">{wf.requester}</span>
                    </td>
                    {/* Assigned */}
                    <td className="px-4 py-3 hidden md:table-cell w-32">
                      {wf.assigned_to
                        ? <span className="text-xs text-gray-600 truncate block">{wf.assigned_to}</span>
                        : <span className="text-xs text-gray-300">—</span>
                      }
                    </td>
                    {/* Priority */}
                    <td className="px-4 py-3 w-24">
                      <div className="flex items-center gap-1.5">
                        <PriorityDot priority={wf.priority} />
                        <span className="text-xs text-gray-500 capitalize">{wf.priority}</span>
                      </div>
                    </td>
                    {/* Due date */}
                    <td className="px-4 py-3 hidden lg:table-cell w-20">
                      {wf.due_date ? (
                        <span className="text-xs text-gray-500">{format(new Date(wf.due_date), 'MMM d')}</span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-4 py-3 w-24">
                      <StatusPill status={wf.status} />
                    </td>
                    {/* Row menu */}
                    <td className="px-3 py-3 w-10" onClick={e => e.stopPropagation()}>
                      <RowMenu workflow={wf} onAction={action => handleRowAction(action, wf)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Overlays */}
      {showNew && (
        <NewRequestModal
          onClose={() => setShowNew(false)}
          onSuccess={invalidate}
        />
      )}
      {selectedWorkflow && (
        <WorkflowSlideOver
          workflow={selectedWorkflow}
          onClose={() => setSelectedWorkflow(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onComment={handleComment}
        />
      )}
    </div>
  );
}

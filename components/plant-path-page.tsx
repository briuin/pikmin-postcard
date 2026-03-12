'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseLocationInput } from '@/components/workbench/utils';
import { panelClassName } from '@/components/workbench/explore-view/styles';
import { signIn, useSession } from '@/lib/auth-client';
import { apiFetch } from '@/lib/client-api';
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import { messages, type Locale, type PlantPathsText } from '@/lib/i18n';
import type { PlantPathCoordinate, PlantPathListPayload, PlantPathRecord } from '@/lib/plant-paths/types';
import { PlantPathVisibility } from '@/lib/plant-paths/types';

const OpenMap = dynamic(
  async () => {
    const mod = await import('@/components/open-map');
    return mod.OpenMap;
  },
  { ssr: false }
);

type PathCollectionKey = 'owned' | 'saved' | 'public';
type DraftCoordinatePoint = { latitude: number; longitude: number };

function duplicatePath(path: PlantPathRecord): PlantPathRecord {
  return {
    ...path,
    coordinates: path.coordinates.map((coordinate) => ({ ...coordinate }))
  };
}

function firstAvailablePathId(payload: PlantPathListPayload): string | null {
  return payload.ownedPaths[0]?.id ?? payload.savedPaths[0]?.id ?? payload.publicPaths[0]?.id ?? null;
}

function resolveCollectionForPath(payload: PlantPathListPayload, pathId: string | null): PathCollectionKey | null {
  if (!pathId) {
    return null;
  }
  if (payload.ownedPaths.some((path) => path.id === pathId)) {
    return 'owned';
  }
  if (payload.savedPaths.some((path) => path.id === pathId)) {
    return 'saved';
  }
  if (payload.publicPaths.some((path) => path.id === pathId)) {
    return 'public';
  }
  return null;
}

function pointLabel(index: number, latitude: number, longitude: number) {
  return `#${index + 1} · ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

function createDraftCoordinate(
  path: PlantPathRecord,
  point: DraftCoordinatePoint
): PlantPathCoordinate {
  return {
    id: `ppc_${Date.now()}_${path.coordinates.length}`,
    latitude: point.latitude,
    longitude: point.longitude
  };
}

function emptyTextForCollection(text: PlantPathsText, key: PathCollectionKey) {
  if (key === 'owned') {
    return text.emptyOwned;
  }
  if (key === 'saved') {
    return text.emptySaved;
  }
  return text.emptyPublic;
}

type PlantPathPageProps = {
  locale?: Locale;
};

export function PlantPathPage({ locale = 'en' }: PlantPathPageProps) {
  const text = messages[locale].plantPaths;
  const parseText = messages[locale].workbench;
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';

  const [payload, setPayload] = useState<PlantPathListPayload>({
    ownedPaths: [],
    savedPaths: [],
    publicPaths: []
  });
  const [activeCollection, setActiveCollection] = useState<PathCollectionKey>('owned');
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [newPathName, setNewPathName] = useState('');
  const [manualCoordinateInput, setManualCoordinateInput] = useState('');
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState<PlantPathRecord | null>(null);
  const [draftPoint, setDraftPoint] = useState<DraftCoordinatePoint | null>(null);
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);

  const visiblePublicPaths = useMemo(
    () => payload.publicPaths.filter((path) => !path.isOwnedByViewer && !path.isSavedByViewer),
    [payload.publicPaths]
  );
  const pathCollections = useMemo(
    () =>
      [
        { key: 'owned' as const, title: text.ownedTitle, paths: payload.ownedPaths },
        { key: 'saved' as const, title: text.savedTitle, paths: payload.savedPaths },
        { key: 'public' as const, title: text.publicTitle, paths: visiblePublicPaths }
      ] satisfies Array<{ key: PathCollectionKey; title: string; paths: PlantPathRecord[] }>,
    [payload.ownedPaths, payload.savedPaths, text.ownedTitle, text.publicTitle, text.savedTitle, visiblePublicPaths]
  );
  const activePaths = pathCollections.find((collection) => collection.key === activeCollection)?.paths ?? [];
  const allPaths = useMemo(
    () => [...payload.ownedPaths, ...payload.savedPaths, ...payload.publicPaths],
    [payload]
  );
  const pathById = useMemo(() => new Map(allPaths.map((path) => [path.id, path])), [allPaths]);
  const selectedSourcePath = selectedPathId ? pathById.get(selectedPathId) ?? null : null;
  const selectedPath =
    draftPath && selectedSourcePath && draftPath.id === selectedSourcePath.id ? draftPath : selectedSourcePath;
  const isSelectedOwned = Boolean(selectedPath?.isOwnedByViewer);

  const mapMarkers = useMemo(
    () =>
      (selectedPath?.coordinates ?? []).map((coordinate, index) => ({
        id: coordinate.id,
        title: pointLabel(index, coordinate.latitude, coordinate.longitude),
        latitude: coordinate.latitude,
        longitude: coordinate.longitude,
        markerBadgeLabel: String(index + 1),
        markerAccentColor: selectedPath?.isOwnedByViewer ? '#2f9e58' : '#3f7ad8'
      })),
    [selectedPath?.coordinates, selectedPath?.isOwnedByViewer]
  );
  const mapPolylines = useMemo(
    () =>
      selectedPath
        ? [
            {
              id: `${selectedPath.id}-polyline`,
              points: selectedPath.coordinates,
              color: selectedPath.isOwnedByViewer ? '#2f9e58' : '#3f7ad8'
            }
          ]
        : [],
    [selectedPath]
  );

  const loadPaths = useCallback(
    async (preferredSelectedPathId?: string | null) => {
      setIsLoading(true);
      try {
        const response = await apiFetch('/api/plant-paths', { cache: 'no-store' });
        const nextPayload = await parseJsonResponseOrThrow<PlantPathListPayload>(response, text.loading);
        setPayload(nextPayload);
        setSelectedPathId((current) => {
          const pathIds = new Set(
            nextPayload.ownedPaths.concat(nextPayload.savedPaths, nextPayload.publicPaths).map((path) => path.id)
          );

          if (preferredSelectedPathId && pathIds.has(preferredSelectedPathId)) {
            return preferredSelectedPathId;
          }
          if (current && pathIds.has(current)) {
            return current;
          }
          return firstAvailablePathId(nextPayload);
        });
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : text.loading);
      } finally {
        setIsLoading(false);
      }
    },
    [text.loading]
  );

  useEffect(() => {
    void loadPaths();
  }, [loadPaths]);

  useEffect(() => {
    if (!selectedSourcePath?.isOwnedByViewer) {
      setDraftPath(null);
      setDraftPoint(null);
      setManualCoordinateInput('');
      setFocusedMarkerId(null);
      return;
    }

    setDraftPath(duplicatePath(selectedSourcePath));
    setDraftPoint(null);
    setManualCoordinateInput('');
    setFocusedMarkerId(null);
  }, [selectedSourcePath]);

  useEffect(() => {
    if (!selectedPathId) {
      return;
    }

    const resolvedCollection = resolveCollectionForPath(payload, selectedPathId);
    if (resolvedCollection && resolvedCollection !== activeCollection) {
      setActiveCollection(resolvedCollection);
    }
  }, [activeCollection, payload, selectedPathId]);

  async function ensureAuthenticatedAction(): Promise<boolean> {
    if (isAuthenticated) {
      return true;
    }
    setStatusText(text.loginRequiredBody);
    await signIn();
    return false;
  }

  async function createPath() {
    if (!(await ensureAuthenticatedAction())) {
      return;
    }
    if (!newPathName.trim()) {
      setStatusText(text.createNameRequired);
      return;
    }

    setIsMutating(true);
    try {
      const response = await apiFetch('/api/plant-paths', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPathName.trim() })
      });
      const created = await parseJsonResponseOrThrow<PlantPathRecord>(response, text.createFailed);
      setNewPathName('');
      setActiveCollection('owned');
      setStatusText(text.createSuccess);
      await loadPaths(created.id);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.createFailed);
    } finally {
      setIsMutating(false);
    }
  }

  function appendCoordinateToDraftPath(point: DraftCoordinatePoint) {
    if (!draftPath) {
      setStatusText(text.onlyOwnEditable);
      return;
    }

    const nextCoordinate = createDraftCoordinate(draftPath, point);
    setDraftPath({
      ...draftPath,
      coordinates: [...draftPath.coordinates, nextCoordinate]
    });
    setFocusedMarkerId(nextCoordinate.id);
    setStatusText('');
  }

  function appendPickedPoint() {
    if (!draftPoint) {
      setStatusText(text.pointNeedsSelection);
      return;
    }

    appendCoordinateToDraftPath(draftPoint);
    setDraftPoint(null);
  }

  function appendManualCoordinate() {
    if (!draftPath) {
      setStatusText(text.onlyOwnEditable);
      return;
    }

    try {
      const parsed = parseLocationInput(manualCoordinateInput, parseText);
      appendCoordinateToDraftPath(parsed);
      setManualCoordinateInput('');
      setDraftPoint(null);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.pointAddFailed);
    }
  }

  function movePoint(index: number, offset: -1 | 1) {
    if (!draftPath) {
      return;
    }

    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= draftPath.coordinates.length) {
      return;
    }

    const nextCoordinates = [...draftPath.coordinates];
    [nextCoordinates[index], nextCoordinates[targetIndex]] = [
      nextCoordinates[targetIndex],
      nextCoordinates[index]
    ];
    setDraftPath({ ...draftPath, coordinates: nextCoordinates });
  }

  function removePoint(index: number) {
    if (!draftPath) {
      return;
    }

    const nextCoordinates = draftPath.coordinates.filter((_, coordinateIndex) => coordinateIndex !== index);
    setDraftPath({
      ...draftPath,
      coordinates: nextCoordinates
    });
  }

  async function saveSelectedPath() {
    if (!(await ensureAuthenticatedAction())) {
      return;
    }
    if (!draftPath) {
      setStatusText(text.onlyOwnEditable);
      return;
    }

    setIsMutating(true);
    try {
      const response = await apiFetch(`/api/plant-paths/${draftPath.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draftPath.name.trim(),
          visibility: draftPath.visibility,
          coordinates: draftPath.coordinates
        })
      });
      await parseJsonResponseOrThrow(response, text.saveFailed);
      setStatusText(text.saveSuccess);
      await loadPaths(draftPath.id);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.saveFailed);
    } finally {
      setIsMutating(false);
    }
  }

  async function deleteSelectedPath() {
    if (!(await ensureAuthenticatedAction())) {
      return;
    }
    if (!selectedPath?.isOwnedByViewer) {
      setStatusText(text.onlyOwnEditable);
      return;
    }

    const shouldDelete = window.confirm(text.deleteConfirmBody(selectedPath.name));
    if (!shouldDelete) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await apiFetch(`/api/plant-paths/${selectedPath.id}`, {
        method: 'DELETE'
      });
      await parseJsonResponseOrThrow(response, text.deleteFailed);
      setStatusText(text.deleteSuccess);
      setDraftPath(null);
      await loadPaths(null);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.deleteFailed);
    } finally {
      setIsMutating(false);
    }
  }

  async function cloneSelectedPath() {
    if (!(await ensureAuthenticatedAction())) {
      return;
    }
    if (!selectedPath) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await apiFetch(`/api/plant-paths/${selectedPath.id}/clone`, {
        method: 'POST'
      });
      const cloned = await parseJsonResponseOrThrow<PlantPathRecord>(response, text.cloneFailed);
      setActiveCollection('owned');
      setStatusText(text.cloneSuccess);
      await loadPaths(cloned.id);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.cloneFailed);
    } finally {
      setIsMutating(false);
    }
  }

  async function toggleSaveSelectedPath() {
    if (!(await ensureAuthenticatedAction())) {
      return;
    }
    if (!selectedPath || selectedPath.isOwnedByViewer) {
      return;
    }

    setIsMutating(true);
    try {
      const response = await apiFetch(`/api/plant-paths/${selectedPath.id}/save`, {
        method: selectedPath.isSavedByViewer ? 'DELETE' : 'POST'
      });
      await parseJsonResponseOrThrow(
        response,
        selectedPath.isSavedByViewer ? text.unsavePublicFailed : text.savePublicFailed
      );
      setStatusText(selectedPath.isSavedByViewer ? text.unsavePublicSuccess : text.savePublicSuccess);
      await loadPaths(selectedPath.id);
    } catch (error) {
      setStatusText(
        error instanceof Error
          ? error.message
          : selectedPath.isSavedByViewer
            ? text.unsavePublicFailed
            : text.savePublicFailed
      );
    } finally {
      setIsMutating(false);
    }
  }

  function handleCollectionChange(nextCollection: PathCollectionKey) {
    setActiveCollection(nextCollection);
    const nextPaths = pathCollections.find((collection) => collection.key === nextCollection)?.paths ?? [];
    setSelectedPathId((current) => (current && nextPaths.some((path) => path.id === current) ? current : nextPaths[0]?.id ?? null));
    setFocusedMarkerId(null);
  }

  return (
    <article
      className={`${panelClassName} grid h-full min-h-0 grid-cols-[minmax(320px,390px)_minmax(0,1fr)] items-stretch gap-2 max-[1080px]:h-auto max-[1080px]:grid-cols-1`}
    >
      <aside className="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] gap-2 overflow-hidden max-[1080px]:order-2 max-[1080px]:h-auto max-[1080px]:grid-rows-[auto_auto_auto] max-[1080px]:overflow-visible">
        <header className="rounded-[20px] border border-[#d9ebda] bg-[linear-gradient(150deg,rgba(255,255,255,0.96),rgba(242,255,245,0.94))] px-4 py-3 shadow-[0_10px_24px_rgba(55,82,66,0.08)]">
          <h2 className="text-[1.35rem]">{text.title}</h2>
          <p className="m-0 text-sm text-[#547062]">{text.subtitle}</p>
        </header>

        {isLoading ? (
          <section className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 text-sm text-[#587365] shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
            {text.loading}
          </section>
        ) : !selectedPath ? (
          <section className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 text-sm text-[#587365] shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
            {text.noSelection}
          </section>
        ) : (
          <section className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
            <div className="flex items-start justify-between gap-3">
              <div className="grid gap-1">
                <strong>{text.selectedTitle}</strong>
                <h3 className="m-0 text-[1rem] text-[#244535]">{selectedPath.name}</h3>
              </div>
              <span className="rounded-full border border-[#dce8dc] bg-[rgba(247,252,247,0.9)] px-2.5 py-1 text-xs font-bold text-[#587365]">
                {selectedPath.visibility === PlantPathVisibility.PUBLIC ? text.visibilityPublic : text.visibilityPrivate}
              </span>
            </div>
            <div className="mt-3 grid gap-1 text-sm text-[#587365]">
              <small>{text.ownerLabel(selectedPath.ownerName)}</small>
              <small>{text.pointsLabel(selectedPath.coordinates.length)}</small>
              <small>{text.updatedLabel(selectedPath.updatedAt)}</small>
              <small>
                {selectedPath.isOwnedByViewer
                  ? text.selectionOwned
                  : selectedPath.isSavedByViewer
                    ? text.selectionSaved
                    : text.selectionReadonly}
              </small>
            </div>
          </section>
        )}

        <div className="grid min-h-0 content-start gap-3 overflow-auto overscroll-contain pr-1 max-[1080px]:overflow-visible max-[1080px]:pr-0">
          <section className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
            <div className="grid gap-1">
              <strong>{text.libraryTitle}</strong>
              <small className="text-[#587365]">{text.librarySubtitle}</small>
            </div>

            <div className="mt-3 grid gap-2 rounded-[16px] border border-[#dce8dc] bg-[rgba(247,252,247,0.86)] p-3">
              <label className="grid gap-1 text-sm font-semibold text-[#274635]">
                {text.createTitle}
                <input
                  className="rounded-[14px] border border-[#d1e4d0] bg-white px-3 py-2 text-sm text-[#254435] outline-none"
                  value={newPathName}
                  onChange={(event) => setNewPathName(event.target.value)}
                  placeholder={text.createPlaceholder}
                  disabled={isMutating}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-full bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                  onClick={() => void createPath()}
                  disabled={isMutating}
                >
                  {text.createButton}
                </button>
                {!isAuthenticated ? (
                  <button
                    type="button"
                    className="rounded-full border border-[#cfe2cc] bg-white px-3 py-2 text-sm font-semibold text-[#2d6542]"
                    onClick={() => void signIn()}
                  >
                    {text.signInButton}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {pathCollections.map((collection) => (
                <button
                  key={collection.key}
                  type="button"
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                    activeCollection === collection.key
                      ? 'border-[#49a567] bg-[rgba(239,255,240,0.94)] text-[#1e5d35]'
                      : 'border-[#d8e7d8] bg-white text-[#406351]'
                  }`}
                  onClick={() => handleCollectionChange(collection.key)}
                >
                  <span>{collection.title}</span>
                  <span className="rounded-full bg-[rgba(255,255,255,0.86)] px-2 py-0.5 text-xs font-bold text-[#587365]">
                    {collection.paths.length}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-2">
              {activePaths.length === 0 ? (
                <small className="text-[#587365]">{emptyTextForCollection(text, activeCollection)}</small>
              ) : (
                activePaths.map((path) => (
                  <button
                    key={path.id}
                    type="button"
                    className={`grid gap-1 rounded-[14px] border px-3 py-2 text-left ${
                      selectedPathId === path.id
                        ? 'border-[#49a567] bg-[rgba(239,255,240,0.94)]'
                        : 'border-[#dce8dc] bg-[rgba(248,252,248,0.92)]'
                    }`}
                    onClick={() => {
                      setSelectedPathId(path.id);
                      setFocusedMarkerId(null);
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-sm text-[#244535]">{path.name}</strong>
                      <span className="rounded-full bg-[rgba(255,255,255,0.86)] px-2 py-0.5 text-[0.68rem] font-bold text-[#587365]">
                        {path.visibility === PlantPathVisibility.PUBLIC ? text.visibilityPublic : text.visibilityPrivate}
                      </span>
                    </div>
                    <small className="text-[#587365]">{text.ownerLabel(path.ownerName)}</small>
                    <small className="text-[#587365]">{text.pointsLabel(path.coordinates.length)}</small>
                  </button>
                ))
              )}
            </div>
          </section>

          {!isLoading && selectedPath ? (
            <>
              {isSelectedOwned ? (
                <>
                  <section className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
                    <div className="grid gap-1">
                      <strong>{text.editDetailsTitle}</strong>
                      <small className="text-[#587365]">{text.editDetailsHint}</small>
                    </div>

                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-1 text-sm font-semibold text-[#274635]">
                        {text.nameLabel}
                        <input
                          className="rounded-[14px] border border-[#d1e4d0] bg-white px-3 py-2 text-sm text-[#254435] outline-none"
                          value={draftPath?.name ?? ''}
                          onChange={(event) =>
                            draftPath ? setDraftPath({ ...draftPath, name: event.target.value }) : undefined
                          }
                          disabled={isMutating}
                        />
                      </label>

                      <label className="grid gap-1 text-sm font-semibold text-[#274635]">
                        {text.visibilityLabel}
                        <select
                          className="rounded-[14px] border border-[#d1e4d0] bg-white px-3 py-2 text-sm text-[#254435] outline-none"
                          value={draftPath?.visibility ?? PlantPathVisibility.PRIVATE}
                          onChange={(event) =>
                            draftPath
                              ? setDraftPath({
                                  ...draftPath,
                                  visibility:
                                    event.target.value === PlantPathVisibility.PUBLIC
                                      ? PlantPathVisibility.PUBLIC
                                      : PlantPathVisibility.PRIVATE
                                })
                              : undefined
                          }
                          disabled={isMutating}
                        >
                          <option value={PlantPathVisibility.PRIVATE}>{text.visibilityPrivate}</option>
                          <option value={PlantPathVisibility.PUBLIC}>{text.visibilityPublic}</option>
                        </select>
                      </label>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                          onClick={() => void saveSelectedPath()}
                          disabled={isMutating}
                        >
                          {text.saveChanges}
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-[#edcfc6] bg-white px-3 py-2 text-sm font-semibold text-[#96533d] disabled:opacity-60"
                          onClick={() => void deleteSelectedPath()}
                          disabled={isMutating}
                        >
                          {text.deletePath}
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
                    <div className="grid gap-1">
                      <strong>{text.addCoordinateTitle}</strong>
                      <small className="text-[#587365]">{text.addCoordinateHint}</small>
                    </div>

                    <div className="mt-3 grid gap-3">
                      <label className="grid gap-1 text-sm font-semibold text-[#274635]">
                        {text.manualCoordinateLabel}
                        <input
                          className="rounded-[14px] border border-[#d1e4d0] bg-white px-3 py-2 text-sm text-[#254435] outline-none"
                          value={manualCoordinateInput}
                          onChange={(event) => setManualCoordinateInput(event.target.value)}
                          placeholder={text.manualCoordinatePlaceholder}
                          disabled={isMutating}
                        />
                      </label>
                      <small className="text-[#587365]">{text.manualCoordinateHelp}</small>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-full bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                          onClick={appendManualCoordinate}
                          disabled={isMutating || !manualCoordinateInput.trim()}
                        >
                          {text.appendManualPointButton}
                        </button>
                      </div>

                      <div className="rounded-[16px] border border-[#d8ead9] bg-[#f7fff6] px-3 py-3">
                        <div className="grid gap-1">
                          <strong className="text-sm text-[#244535]">{text.addPointButton}</strong>
                          <small className="text-[#587365]">{text.pickPointHint}</small>
                        </div>

                        {draftPoint ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <small className="text-[#2a5d3c]">
                              {text.pickedPointLabel(draftPoint.latitude, draftPoint.longitude)}
                            </small>
                            <button
                              type="button"
                              className="rounded-full border border-[#b8dabd] bg-white px-3 py-1.5 text-xs font-semibold text-[#2d6743]"
                              onClick={appendPickedPoint}
                            >
                              {text.addPointButton}
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-[#d8e7d8] bg-white px-3 py-1.5 text-xs font-semibold text-[#587365]"
                              onClick={() => setDraftPoint(null)}
                            >
                              {text.clearPickedPoint}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <section className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
                  <div className="grid gap-1">
                    <strong>{text.actionsTitle}</strong>
                    <small className="text-[#587365]">{text.readonlyActionsHint}</small>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-full bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
                      onClick={() => void cloneSelectedPath()}
                      disabled={isMutating}
                    >
                      {text.clonePath}
                    </button>
                    {selectedPath.visibility === PlantPathVisibility.PUBLIC ? (
                      <button
                        type="button"
                        className="rounded-full border border-[#cfe2cc] bg-white px-3 py-2 text-sm font-semibold text-[#2d6542] disabled:opacity-60"
                        onClick={() => void toggleSaveSelectedPath()}
                        disabled={isMutating}
                      >
                        {selectedPath.isSavedByViewer ? text.unsavePublicPath : text.savePublicPath}
                      </button>
                    ) : null}
                  </div>
                </section>
              )}

              <section className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
                <div className="flex items-center justify-between gap-2">
                  <strong>{text.coordinateListTitle}</strong>
                  <small className="text-[#587365]">{text.pointsLabel(selectedPath.coordinates.length)}</small>
                </div>

                {(isSelectedOwned ? draftPath?.coordinates : selectedPath.coordinates)?.length ? (
                  <div className="mt-3 grid gap-2">
                    {(isSelectedOwned ? draftPath?.coordinates : selectedPath.coordinates)?.map((coordinate, index) => (
                      <div
                        key={coordinate.id}
                        className="rounded-[14px] border border-[#dde9dd] bg-[rgba(248,252,248,0.92)] px-3 py-2"
                      >
                        <div className="grid gap-2">
                          <button
                            type="button"
                            className="flex items-center gap-2 text-left"
                            onClick={() => setFocusedMarkerId(coordinate.id)}
                          >
                            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[rgba(239,255,240,0.94)] px-2 text-xs font-bold text-[#2f7a47]">
                              {index + 1}
                            </span>
                            <span className="font-mono text-sm font-semibold text-[#244535]">
                              {coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}
                            </span>
                          </button>

                          {isSelectedOwned ? (
                            <div className="flex flex-wrap gap-2 pl-8">
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d2e3cf] bg-white text-[#325f41] disabled:opacity-50"
                                onClick={() => movePoint(index, -1)}
                                disabled={index === 0}
                                aria-label={text.moveUp}
                                title={text.moveUp}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 16 16"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M8 12V4" />
                                  <path d="M4.5 7.5 8 4l3.5 3.5" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d2e3cf] bg-white text-[#325f41] disabled:opacity-50"
                                onClick={() => movePoint(index, 1)}
                                disabled={index === (draftPath?.coordinates.length ?? 1) - 1}
                                aria-label={text.moveDown}
                                title={text.moveDown}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 16 16"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M8 4v8" />
                                  <path d="m4.5 8.5 3.5 3.5 3.5-3.5" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#ecd1c9] bg-white text-[#99563f]"
                                onClick={() => removePoint(index)}
                                aria-label={text.removePoint}
                                title={text.removePoint}
                              >
                                <svg
                                  aria-hidden="true"
                                  viewBox="0 0 16 16"
                                  className="h-3.5 w-3.5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M3.5 4.5h9" />
                                  <path d="M6.5 2.75h3" />
                                  <path d="M5 4.5v7.25" />
                                  <path d="M8 4.5v7.25" />
                                  <path d="M11 4.5v7.25" />
                                  <path d="M4.5 4.5 5 13h6l.5-8.5" />
                                </svg>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <small className="mt-3 block text-[#587365]">{text.noPoints}</small>
                )}
              </section>
            </>
          ) : null}

          {statusText ? (
            <div className="rounded-[16px] border border-[#dae7d9] bg-[rgba(247,252,247,0.92)] px-3 py-2 text-sm text-[#406351]">
              {statusText}
            </div>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 h-full min-h-0 max-[1080px]:order-1">
        <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] rounded-[20px] border border-[#dcead8] bg-white/90 p-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
          <div className="mb-2 grid gap-0.5">
            <strong>{text.mapTitle}</strong>
            <small className="text-[#587365]">{text.mapSubtitle}</small>
          </div>
          <div className="min-h-0">
            <OpenMap
              className="h-full min-h-[560px] max-[1080px]:h-[420px] max-[880px]:min-h-0 max-[880px]:h-[400px]"
              markers={mapMarkers}
              clusterMarkers={false}
              polylines={mapPolylines}
              focusedMarkerId={focusedMarkerId}
              draftPoint={
                draftPoint
                  ? {
                      latitude: draftPoint.latitude,
                      longitude: draftPoint.longitude,
                      label: text.pickedPointLabel(draftPoint.latitude, draftPoint.longitude)
                    }
                  : undefined
              }
              onPick={(latitude, longitude) => {
                if (!selectedPath?.isOwnedByViewer) {
                  setStatusText(text.onlyOwnEditable);
                  return;
                }
                setDraftPoint({ latitude, longitude });
              }}
              simpleMarkerPopup
            />
          </div>
        </div>
      </div>
    </article>
  );
}

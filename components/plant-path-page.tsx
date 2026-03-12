'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { panelClassName } from '@/components/workbench/explore-view/styles';
import { apiFetch } from '@/lib/client-api';
import { parseJsonResponseOrThrow } from '@/lib/http-response';
import { messages, type Locale } from '@/lib/i18n';
import { signIn, useSession } from '@/lib/auth-client';
import type { PlantPathCoordinate, PlantPathListPayload, PlantPathRecord } from '@/lib/plant-paths/types';
import { PlantPathVisibility } from '@/lib/plant-paths/types';

const OpenMap = dynamic(
  async () => {
    const mod = await import('@/components/open-map');
    return mod.OpenMap;
  },
  { ssr: false }
);

function duplicatePath(path: PlantPathRecord): PlantPathRecord {
  return {
    ...path,
    coordinates: path.coordinates.map((coordinate) => ({ ...coordinate }))
  };
}

function firstAvailablePathId(payload: PlantPathListPayload): string | null {
  return (
    payload.ownedPaths[0]?.id ??
    payload.savedPaths[0]?.id ??
    payload.publicPaths[0]?.id ??
    null
  );
}

function pointLabel(index: number, latitude: number, longitude: number) {
  return `#${index + 1} · ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
}

type PlantPathPageProps = {
  locale?: Locale;
};

export function PlantPathPage({ locale = 'en' }: PlantPathPageProps) {
  const text = messages[locale].plantPaths;
  const { status: sessionStatus } = useSession();
  const isAuthenticated = sessionStatus === 'authenticated';

  const [payload, setPayload] = useState<PlantPathListPayload>({
    ownedPaths: [],
    savedPaths: [],
    publicPaths: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [newPathName, setNewPathName] = useState('');
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null);
  const [draftPath, setDraftPath] = useState<PlantPathRecord | null>(null);
  const [draftPoint, setDraftPoint] = useState<{ latitude: number; longitude: number } | null>(null);
  const [focusedMarkerId, setFocusedMarkerId] = useState<string | null>(null);

  const allPaths = useMemo(
    () => [...payload.ownedPaths, ...payload.savedPaths, ...payload.publicPaths],
    [payload]
  );
  const pathById = useMemo(() => new Map(allPaths.map((path) => [path.id, path])), [allPaths]);
  const selectedSourcePath = selectedPathId ? pathById.get(selectedPathId) ?? null : null;
  const selectedPath =
    draftPath && selectedSourcePath && draftPath.id === selectedSourcePath.id ? draftPath : selectedSourcePath;
  const isSelectedOwned = Boolean(selectedPath?.isOwnedByViewer);
  const visiblePublicPaths = useMemo(
    () => payload.publicPaths.filter((path) => !path.isOwnedByViewer && !path.isSavedByViewer),
    [payload.publicPaths]
  );

  const mapMarkers = useMemo(
    () =>
      (selectedPath?.coordinates ?? []).map((coordinate, index) => ({
        id: coordinate.id,
        title: pointLabel(index, coordinate.latitude, coordinate.longitude),
        latitude: coordinate.latitude,
        longitude: coordinate.longitude
      })),
    [selectedPath?.coordinates]
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
          if (preferredSelectedPathId && new Set(nextPayload.ownedPaths.concat(nextPayload.savedPaths, nextPayload.publicPaths).map((path) => path.id)).has(preferredSelectedPathId)) {
            return preferredSelectedPathId;
          }
          if (current && new Set(nextPayload.ownedPaths.concat(nextPayload.savedPaths, nextPayload.publicPaths).map((path) => path.id)).has(current)) {
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
      setFocusedMarkerId(null);
      return;
    }

    setDraftPath(duplicatePath(selectedSourcePath));
    setDraftPoint(null);
    setFocusedMarkerId(null);
  }, [selectedSourcePath]);

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
      setStatusText(text.createSuccess);
      await loadPaths(created.id);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.createFailed);
    } finally {
      setIsMutating(false);
    }
  }

  function appendPickedPoint() {
    if (!draftPath) {
      setStatusText(text.onlyOwnEditable);
      return;
    }
    if (!draftPoint) {
      setStatusText(text.pointNeedsSelection);
      return;
    }
    const nextCoordinate: PlantPathCoordinate = {
      id: `ppc_${Date.now()}_${draftPath.coordinates.length}`,
      latitude: draftPoint.latitude,
      longitude: draftPoint.longitude
    };
    setDraftPath({
      ...draftPath,
      coordinates: [...draftPath.coordinates, nextCoordinate]
    });
    setFocusedMarkerId(nextCoordinate.id);
    setDraftPoint(null);
    setStatusText('');
  }

  function movePoint(index: number, offset: -1 | 1) {
    if (!draftPath) {
      return;
    }
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= draftPath.coordinates.length) {
      return;
    }
    const next = [...draftPath.coordinates];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setDraftPath({ ...draftPath, coordinates: next });
  }

  function removePoint(index: number) {
    if (!draftPath) {
      return;
    }
    setDraftPath({
      ...draftPath,
      coordinates: draftPath.coordinates.filter((_, coordinateIndex) => coordinateIndex !== index)
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

  return (
    <article
      className={`${panelClassName} grid h-full min-h-0 grid-cols-[minmax(320px,390px)_minmax(0,1fr)] items-stretch gap-2 max-[1080px]:h-auto max-[1080px]:grid-cols-1`}
    >
      <aside className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-2 overflow-hidden max-[1080px]:order-2 max-[1080px]:h-auto max-[1080px]:grid-rows-[auto_auto] max-[1080px]:overflow-visible">
        <header className="rounded-[20px] border border-[#d9ebda] bg-[linear-gradient(150deg,rgba(255,255,255,0.96),rgba(242,255,245,0.94))] px-4 py-3 shadow-[0_10px_24px_rgba(55,82,66,0.08)]">
          <h2 className="text-[1.35rem]">{text.title}</h2>
          <p className="m-0 text-sm text-[#547062]">{text.subtitle}</p>
        </header>

        <div className="grid min-h-0 content-start gap-3 overflow-auto overscroll-contain pr-1 max-[1080px]:overflow-visible max-[1080px]:pr-0">
          <div className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
            <strong>{text.createTitle}</strong>
            <p className="mt-1 text-sm text-[#577264]">{isAuthenticated ? text.authHint : text.loginRequiredBody}</p>
            <div className="mt-2 grid gap-2">
              <input
                className="rounded-[14px] border border-[#d1e4d0] bg-white px-3 py-2 text-sm text-[#254435] outline-none"
                value={newPathName}
                onChange={(event) => setNewPathName(event.target.value)}
                placeholder={text.createPlaceholder}
                disabled={isMutating}
              />
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
          </div>

          <PathListCard
            title={text.ownedTitle}
            emptyText={text.emptyOwned}
            paths={payload.ownedPaths}
            selectedPathId={selectedPathId}
            onSelectPath={setSelectedPathId}
            text={text}
          />
          <PathListCard
            title={text.savedTitle}
            emptyText={text.emptySaved}
            paths={payload.savedPaths}
            selectedPathId={selectedPathId}
            onSelectPath={setSelectedPathId}
            text={text}
          />
          <PathListCard
            title={text.publicTitle}
            emptyText={text.emptyPublic}
            paths={visiblePublicPaths}
            selectedPathId={selectedPathId}
            onSelectPath={setSelectedPathId}
            text={text}
          />

          <div className="rounded-[20px] border border-[#dcead8] bg-white/90 p-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
            {isLoading ? (
              <p className="m-0 text-sm text-[#587365]">{text.loading}</p>
            ) : !selectedPath ? (
              <p className="m-0 text-sm text-[#587365]">{text.noSelection}</p>
            ) : (
              <div className="grid gap-3">
                <div className="grid gap-1">
                  <strong>{text.selectedTitle}</strong>
                  <small className="text-[#587365]">{text.ownerLabel(selectedPath.ownerName)}</small>
                  <small className="text-[#587365]">{text.pointsLabel(selectedPath.coordinates.length)}</small>
                  <small className="text-[#587365]">{text.updatedLabel(selectedPath.updatedAt)}</small>
                  <small className="text-[#587365]">
                    {selectedPath.isOwnedByViewer
                      ? text.selectionOwned
                      : selectedPath.isSavedByViewer
                        ? text.selectionSaved
                        : text.selectionReadonly}
                  </small>
                </div>

                <label className="grid gap-1 text-sm font-semibold text-[#274635]">
                  {text.nameLabel}
                  <input
                    className="rounded-[14px] border border-[#d1e4d0] bg-white px-3 py-2 text-sm text-[#254435] outline-none disabled:bg-[#f4f7f4]"
                    value={isSelectedOwned ? draftPath?.name ?? '' : selectedPath.name}
                    onChange={(event) =>
                      isSelectedOwned && draftPath
                        ? setDraftPath({ ...draftPath, name: event.target.value })
                        : undefined
                    }
                    disabled={!isSelectedOwned || isMutating}
                  />
                </label>

                <label className="grid gap-1 text-sm font-semibold text-[#274635]">
                  {text.visibilityLabel}
                  <select
                    className="rounded-[14px] border border-[#d1e4d0] bg-white px-3 py-2 text-sm text-[#254435] outline-none disabled:bg-[#f4f7f4]"
                    value={isSelectedOwned ? draftPath?.visibility ?? PlantPathVisibility.PRIVATE : selectedPath.visibility}
                    onChange={(event) =>
                      isSelectedOwned && draftPath
                        ? setDraftPath({
                            ...draftPath,
                            visibility:
                              event.target.value === PlantPathVisibility.PUBLIC
                                ? PlantPathVisibility.PUBLIC
                                : PlantPathVisibility.PRIVATE
                          })
                        : undefined
                    }
                    disabled={!isSelectedOwned || isMutating}
                  >
                    <option value={PlantPathVisibility.PRIVATE}>{text.visibilityPrivate}</option>
                    <option value={PlantPathVisibility.PUBLIC}>{text.visibilityPublic}</option>
                  </select>
                </label>

                {draftPoint && isSelectedOwned ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-[#d8ead9] bg-[#f7fff6] px-3 py-2">
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
                  </div>
                ) : null}

                <div className="grid gap-2">
                  <strong>{text.coordinateListTitle}</strong>
                  {(isSelectedOwned ? draftPath?.coordinates : selectedPath.coordinates)?.length ? (
                    <div className="grid gap-2">
                      {(isSelectedOwned ? draftPath?.coordinates : selectedPath.coordinates)?.map((coordinate, index) => (
                        <div
                          key={coordinate.id}
                          className="grid gap-2 rounded-[14px] border border-[#dde9dd] bg-[rgba(248,252,248,0.92)] px-3 py-2"
                        >
                          <button
                            type="button"
                            className="text-left text-sm font-semibold text-[#244535]"
                            onClick={() => setFocusedMarkerId(coordinate.id)}
                          >
                            {text.pointLabel(index)} · {coordinate.latitude.toFixed(6)}, {coordinate.longitude.toFixed(6)}
                          </button>
                          {isSelectedOwned ? (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                className="rounded-full border border-[#d2e3cf] bg-white px-2.5 py-1 text-xs font-semibold text-[#325f41]"
                                onClick={() => movePoint(index, -1)}
                                disabled={index === 0}
                              >
                                {text.moveUp}
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-[#d2e3cf] bg-white px-2.5 py-1 text-xs font-semibold text-[#325f41]"
                                onClick={() => movePoint(index, 1)}
                                disabled={index === (draftPath?.coordinates.length ?? 1) - 1}
                              >
                                {text.moveDown}
                              </button>
                              <button
                                type="button"
                                className="rounded-full border border-[#ecd1c9] bg-white px-2.5 py-1 text-xs font-semibold text-[#99563f]"
                                onClick={() => removePoint(index)}
                              >
                                {text.removePoint}
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <small className="text-[#587365]">{text.noPoints}</small>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {isSelectedOwned ? (
                    <>
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
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

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
                setStatusText(text.pickPointHint);
              }}
              simpleMarkerPopup
            />
          </div>
        </div>
      </div>
    </article>
  );
}

function PathListCard({
  title,
  emptyText,
  paths,
  selectedPathId,
  onSelectPath,
  text
}: {
  title: string;
  emptyText: string;
  paths: PlantPathRecord[];
  selectedPathId: string | null;
  onSelectPath: (pathId: string) => void;
  text: (typeof messages.en)['plantPaths'];
}) {
  return (
    <div className="rounded-[20px] border border-[#dcead8] bg-white/90 px-3.5 py-3 shadow-[0_10px_24px_rgba(60,82,68,0.06)]">
      <strong>{title}</strong>
      <div className="mt-2 grid gap-2">
        {paths.length === 0 ? (
          <small className="text-[#587365]">{emptyText}</small>
        ) : (
          paths.map((path) => (
            <button
              key={path.id}
              type="button"
              className={`grid gap-1 rounded-[14px] border px-3 py-2 text-left ${
                selectedPathId === path.id
                  ? 'border-[#49a567] bg-[rgba(239,255,240,0.94)]'
                  : 'border-[#dce8dc] bg-[rgba(248,252,248,0.92)]'
              }`}
              onClick={() => onSelectPath(path.id)}
            >
              <strong className="text-sm text-[#244535]">{path.name}</strong>
              <small className="text-[#587365]">{text.ownerLabel(path.ownerName)}</small>
              <small className="text-[#587365]">{text.pointsLabel(path.coordinates.length)}</small>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

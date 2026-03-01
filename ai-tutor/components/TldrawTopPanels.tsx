"use client";

import { memo, useCallback } from "react";
import {
  PORTRAIT_BREAKPOINT,
  TldrawUiButtonIcon,
  TldrawUiRow,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  unwrapLabel,
  useActions,
  useBreakpoint,
  useEditor,
  useLocalStorageState,
  useTldrawUiComponents,
  useTranslation,
  useValue,
} from "tldraw";

export const EduEquityMenuPanel = memo(function EduEquityMenuPanel() {
  const breakpoint = useBreakpoint();
  const msg = useTranslation();
  const { MainMenu, QuickActions, ActionsMenu, PageMenu, ZoomMenu } = useTldrawUiComponents();

  const editor = useEditor();
  const isSinglePageMode = useValue(
    "isSinglePageMode",
    () => editor.options.maxPages <= 1,
    [editor]
  );

  const showQuickActions =
    editor.options.actionShortcutsLocation === "menu"
      ? true
      : editor.options.actionShortcutsLocation === "toolbar"
        ? false
        : breakpoint >= PORTRAIT_BREAKPOINT.TABLET;

  if (!MainMenu && !PageMenu && !showQuickActions && !ZoomMenu) return null;

  return (
    <nav className="tlui-menu-zone">
      <TldrawUiRow>
        {MainMenu && <MainMenu />}
        {PageMenu && !isSinglePageMode && <PageMenu />}
        {showQuickActions ? (
          <TldrawUiToolbar orientation="horizontal" label={msg("actions-menu.title")}>
            {QuickActions && <QuickActions />}
            {ActionsMenu && <ActionsMenu />}
          </TldrawUiToolbar>
        ) : null}
        {ZoomMenu && (
          <TldrawUiToolbar orientation="horizontal" label={msg("navigation-zone.title")}>
            <ZoomMenu />
          </TldrawUiToolbar>
        )}
      </TldrawUiRow>
    </nav>
  );
});

export const EduEquityNavigationPanel = memo(function EduEquityNavigationPanel() {
  const actions = useActions();
  const msg = useTranslation();
  const breakpoint = useBreakpoint();
  const [collapsed, setCollapsed] = useLocalStorageState("minimap", true);
  const toggleMinimap = useCallback(() => {
    setCollapsed((value) => !value);
  }, [setCollapsed]);

  const { Minimap } = useTldrawUiComponents();

  if (breakpoint < PORTRAIT_BREAKPOINT.MOBILE || !Minimap) {
    return null;
  }

  return (
    <div className="tlui-navigation-panel">
      <TldrawUiToolbar orientation="horizontal" label={msg("navigation-zone.title")}>
        {!collapsed && (
          <TldrawUiToolbarButton
            type="icon"
            data-testid="minimap.zoom-out"
            title={msg(unwrapLabel(actions["zoom-out"].label))}
            onClick={() => actions["zoom-out"].onSelect("navigation-zone")}
          >
            <TldrawUiButtonIcon small icon="minus" />
          </TldrawUiToolbarButton>
        )}
        {!collapsed && (
          <TldrawUiToolbarButton
            type="icon"
            data-testid="minimap.zoom-in"
            title={msg(unwrapLabel(actions["zoom-in"].label))}
            onClick={() => actions["zoom-in"].onSelect("navigation-zone")}
          >
            <TldrawUiButtonIcon small icon="plus" />
          </TldrawUiToolbarButton>
        )}
        <TldrawUiToolbarButton
          type="icon"
          data-testid="minimap.toggle-button"
          title={msg("navigation-zone.toggle-minimap")}
          onClick={toggleMinimap}
        >
          <TldrawUiButtonIcon small icon={collapsed ? "chevron-right" : "chevron-left"} />
        </TldrawUiToolbarButton>
      </TldrawUiToolbar>
      {breakpoint >= PORTRAIT_BREAKPOINT.TABLET && !collapsed && <Minimap />}
    </div>
  );
});

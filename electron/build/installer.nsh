; Custom NSIS macros for SwitchControl installer
; Placed in buildResources ("build/") so electron-builder includes it automatically.

; Override the DisplayName written to the Windows Uninstall registry.
; electron-builder's default template appends the version number:
;   "SwitchControl 1.0.x"
; This macro runs AFTER the default template writes that value,
; so we overwrite it with just the product name — version stays in DisplayVersion.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" "DisplayName" "SwitchControl"
!macroend

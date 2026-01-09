; Runs before copying files / writing new registry keys.
; Cleans up "orphaned" uninstall entries where the install directory was deleted
; and uninstall.exe no longer exists (causes upgrades to fail).

!macro NSIS_HOOK_PREINSTALL
  ; Read existing uninstall command, if any.
  ClearErrors
  ReadRegStr $R0 SHCTX "${UNINSTKEY}" "UninstallString"

  ; If the uninstall.exe is missing, remove the uninstall + install-location registry keys.
  ; This allows the new installer to proceed without getting stuck on a broken uninstall entry.
  ${IfNot} ${Errors}
    ${If} $R0 != ""
      IfFileExists "$R0" +3 0
        ; Uninstaller exists, keep registry as-is.
        Goto done_orphan_cleanup

      ; Orphaned uninstall entry: remove it.
      DeleteRegKey SHCTX "${UNINSTKEY}"
      DeleteRegKey SHCTX "${MANUPRODUCTKEY}"
      DeleteRegKey /ifempty SHCTX "${MANUKEY}"
    ${EndIf}
  ${EndIf}

done_orphan_cleanup:
!macroend

; Runs after the uninstaller removed files/registry keys/shortcuts.
; Removes application data to provide a "clean uninstall".
!macro NSIS_HOOK_POSTUNINSTALL
  ; Our Rust code stores app data under `<app_data_dir>/${PRODUCTNAME} Data`.
  ; `app_data_dir` typically maps to Roaming AppData on Windows, but we also
  ; check Local AppData to be safe.
  StrCpy $R0 "$APPDATA\${PRODUCTNAME} Data"
  IfFileExists "$R0\*.*" 0 +2
    RMDir /r "$R0"

  StrCpy $R0 "$LOCALAPPDATA\${PRODUCTNAME} Data"
  IfFileExists "$R0\*.*" 0 +2
    RMDir /r "$R0"

  ; Backward compatibility cleanup (old data directory name).
  StrCpy $R0 "$APPDATA\ALR Renamer Data"
  IfFileExists "$R0\*.*" 0 +2
    RMDir /r "$R0"

  StrCpy $R0 "$LOCALAPPDATA\ALR Renamer Data"
  IfFileExists "$R0\*.*" 0 +2
    RMDir /r "$R0"
!macroend

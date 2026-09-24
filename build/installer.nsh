; Lumina installer customisations (picked up automatically by electron-builder).
;
; Smooth, forward-only install progress.
; Stock behaviour: NSIS advances the bar by instruction count while it unpacks the payload,
; then the 7-Zip plugin takes the bar over and restarts it from 0%, then NSIS snaps it back
; to its own count — so the bar runs forward, jumps back, and runs forward again.
; Here the stock bar is hidden and replaced by an identical one that we drive from real work
; done (bytes extracted), only ever moving forward. scripts/patch-nsis.mjs adds the hooks
; (luminaProgress*) into electron-builder's extraction step.

!ifndef BUILD_UNINSTALLER

  Var luminaBar   ; our progress bar window (0 in silent mode)
  Var luminaPos   ; current position, 0..1000
  Var luminaBase  ; where extraction progress starts

  !define LUMINA_EXTRACT_END 900
  !define LUMINA_COPIED 930

  ; Runs right before the "Installing" page is added: attach a SHOW callback to it.
  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW luminaInstFilesShow
  !macroend

  ; UI thread: create our bar exactly over the stock one and hide the stock one.
  Function luminaInstFilesShow
    FindWindow $0 "#32770" "" $HWNDPARENT
    GetDlgItem $1 $0 1004
    System::Call "*(i,i,i,i)p.r2"
    System::Call "user32::GetWindowRect(pr1,pr2)"
    System::Call "user32::MapWindowPoints(p0,pr0,pr2,i2)"
    System::Call "*$2(i.r3,i.r4,i.r5,i.r6)"
    System::Free $2
    IntOp $5 $5 - $3
    IntOp $6 $6 - $4
    ; WS_CHILD | WS_VISIBLE
    System::Call "user32::CreateWindowEx(i0,t'msctls_progress32',p0,i0x50000000,ir3,ir4,ir5,ir6,pr0,p0,p0,p0)p.r7"
    StrCpy $luminaBar $7
    SendMessage $luminaBar 0x406 0 1000 ; PBM_SETRANGE32
    ShowWindow $1 0 ; SW_HIDE
    StrCpy $luminaPos 0
  FunctionEnd

  ; Move the bar to POS if that is further along (never backwards).
  !macro luminaProgressSet POS
    IntCmp ${POS} $luminaPos +3 +3 0
      StrCpy $luminaPos ${POS}
      SendMessage $luminaBar 0x402 $luminaPos 0 ; PBM_SETPOS
  !macroend

  ; Before unpacking: pick up where the stock bar is (steps already done), at least 5%.
  !macro luminaProgressStart
    FindWindow $R3 "#32770" "" $HWNDPARENT
    GetDlgItem $R4 $R3 1004
    SendMessage $R4 0x408 0 0 $R5 ; PBM_GETPOS (stock range is 0..30000)
    IntOp $R5 $R5 / 30
    IntCmp $R5 50 0 0 +2
      StrCpy $R5 50
    IntCmp $R5 400 +2 +2 0
      StrCpy $R5 400
    !insertmacro luminaProgressSet $R5
  !macroend

  ; Payload copied out of the installer; extraction progress runs from here.
  !macro luminaProgressPayloadReady
    IntOp $R5 $luminaPos + 40
    !insertmacro luminaProgressSet $R5
    StrCpy $luminaBase $luminaPos
  !macroend

  !macro luminaExtract FILE
    GetFunctionAddress $R9 luminaExtractProgress
    Nsis7z::ExtractWithCallback "${FILE}" $R9
  !macroend

  ; Fresh install: extract directly into $INSTDIR (the current $OUTDIR) and skip the temp copy.
  !macro luminaExtractDirect FILE
    ${IfNot} ${FileExists} "$OUTDIR\${APP_EXECUTABLE_FILENAME}"
      !insertmacro luminaExtract "${FILE}"
      Goto DoneExtract7za
    ${EndIf}
  !macroend

  ; Worker thread callback from Nsis7z: stack holds (completed bytes, total bytes).
  Function luminaExtractProgress
    Pop $R4
    Pop $R5
    IntOp $R6 $R5 / 1000
    IntCmp $R6 0 0 0 +2
      StrCpy $R6 1
    IntOp $R7 $R4 / $R6 ; permille done
    IntCmp $R7 1000 +2 +2 0
      StrCpy $R7 1000
    IntOp $R8 ${LUMINA_EXTRACT_END} - $luminaBase
    IntOp $R8 $R8 * $R7
    IntOp $R8 $R8 / 1000
    IntOp $R8 $R8 + $luminaBase
    !insertmacro luminaProgressSet $R8
  FunctionEnd

  !macro luminaProgressExtracted
    !insertmacro luminaProgressSet ${LUMINA_COPIED}
  !macroend

  ; Last step of the install section (after files, registry and shortcuts).
  !macro customInstall
    !insertmacro luminaProgressSet 1000
  !macroend

!endif

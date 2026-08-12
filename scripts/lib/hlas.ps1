# scripts/lib/hlas.ps1 — namluví text českým hlasem do WAV.
#
# Volá se z scripts/lib/hlas.js. Text se předává souborem, ne argumentem:
# přes příkazovou řádku by se diakritika rozbila o kódovou stránku konzole.
#
# Používá WinRT (Windows.Media.SpeechSynthesis), ne System.Speech. Český hlas
# Microsoft Jakub je totiž hlas OneCore a starší SAPI ho nevidí — přes
# System.Speech je k dispozici jenom anglická Zira. Přeregistrovat hlas
# v registru by sice šlo, ale sahat kvůli tomuhle do systému nemá cenu.

param(
  [Parameter(Mandatory = $true)][string]$TextFile,
  [Parameter(Mandatory = $true)][string]$Out,
  [double]$Rate = 1.0
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

function Await($op, $type) {
  $t = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $t.Wait(-1) | Out-Null
  $t.Result
}

[Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType=WindowsRuntime] | Out-Null
[Windows.Storage.Streams.DataReader, Windows.Storage, ContentType=WindowsRuntime] | Out-Null

$hlas = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
  Where-Object { $_.Language -eq 'cs-CZ' } | Select-Object -First 1
if (-not $hlas) {
  $k = ([Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
    ForEach-Object { "$($_.DisplayName) ($($_.Language))" }) -join ', '
  throw "Není nainstalovaný český hlas. K dispozici: $k. Doplň ho v Nastavení - Cas a jazyk - Rec."
}

$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$synth.Voice = $hlas
$synth.Options.SpeakingRate = $Rate

$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
$stream = Await $synth.SynthesizeTextToStreamAsync($text) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])

$reader = New-Object Windows.Storage.Streams.DataReader $stream.GetInputStreamAt(0)
Await $reader.LoadAsync($stream.Size) ([uint32]) | Out-Null
$bytes = New-Object byte[] $stream.Size
$reader.ReadBytes($bytes)
[System.IO.File]::WriteAllBytes($Out, $bytes)

Write-Output $hlas.DisplayName

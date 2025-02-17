#!/bin/zsh

# Output file (unique for each terminal session)
OUTPUT_FILE="zsh_env_$(hostname)_$$.txt"

echo "Collecting Zsh environment settings..."
{
  echo "===== ENVIRONMENT VARIABLES (exported) ====="
  printenv | sort
  echo

  echo "===== SHELL VARIABLES (set) ====="
  set | sort
  echo

  echo "===== ZSH OPTIONS (setopt) ====="
  setopt
  echo

  echo "===== ALIASES ====="
  alias
  echo

  echo "===== FUNCTIONS ====="
  functions
  echo

  echo "===== LOADED MODULES ====="
  zmodload
  echo

  echo "===== BINDKEY SETTINGS ====="
  bindkey
  echo

  echo "===== SHELL INFORMATION ====="
  echo "Shell: $SHELL"
  echo "ZDOTDIR: ${ZDOTDIR:-$HOME}"
  echo "ZSHRC: ${ZSHRC:-$HOME/.zshrc}"
  echo "Current Terminal: $(tty)"
  echo "Zsh Version: $ZSH_VERSION"
  echo

  echo "===== LOADED FILES ====="
  echo "Loaded startup files:"
  for file in /etc/zshenv /etc/zprofile /etc/zshrc /etc/zlogin ~/.zshenv ~/.zprofile ~/.zshrc ~/.zlogin; do
    if [[ -f $file ]]; then
      echo "--- $file ---"
      cat "$file"
      echo
    fi
  done
} > "$OUTPUT_FILE"

echo "Zsh environment settings saved to: $OUTPUT_FILE"
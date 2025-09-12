import React from 'react'

interface SimpleSwitchProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
  className?: string
}

export function SimpleSwitch({ checked, onCheckedChange, disabled = false, className = '' }: SimpleSwitchProps) {
  const handleClick = () => {
    if (!disabled) {
      onCheckedChange(!checked)
    }
  }

  // Use inline styles to override global button CSS
  const switchStyle: React.CSSProperties = {
    display: 'inline-flex',
    position: 'relative',
    width: '2.25rem', // w-9
    height: '1.25rem', // h-5
    alignItems: 'center',
    borderRadius: '9999px',
    border: 'none',
    padding: '0',
    backgroundColor: checked ? '#2563eb' : '#d1d5db', // blue-600 : gray-300
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'background-color 200ms ease-in-out',
    boxShadow: 'none',
    fontSize: 'inherit',
    fontWeight: 'inherit',
  }

  const thumbStyle: React.CSSProperties = {
    display: 'inline-block',
    width: '1rem', // w-4
    height: '1rem', // h-4
    borderRadius: '50%',
    backgroundColor: 'white',
    transform: checked ? 'translateX(1rem)' : 'translateX(0)', // translate-x-4 : translate-x-0
    transition: 'transform 200ms ease-in-out',
    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={handleClick}
      style={switchStyle}
      className={className}
    >
      <span style={thumbStyle} />
    </button>
  )
}
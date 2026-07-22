import React, { useState } from 'react';
import { useWallet } from '../contexts/WalletContext';

export function WalletConnect() {
  const { address, isConnected, error, wrongNetwork, connect, disconnect, switchToBradbury } = useWallet();
  const [switching, setSwitching] = useState(false);

  const truncateAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const handleSwitch = async () => {
    setSwitching(true);
    await switchToBradbury();
    setSwitching(false);
  };

  if (wrongNetwork) {
    return (
      <div className="wallet-connect wrong-network">
        <span className="error-message">Wrong Network — Switch to Bradbury</span>
        <div className="network-actions">
          <button className="btn-primary" onClick={handleSwitch} disabled={switching}>
            {switching ? 'Switching...' : 'Switch to Bradbury'}
          </button>
          <button className="btn-secondary" onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="wallet-connect error">
        <span className="error-message">{error}</span>
        <button className="btn-secondary" onClick={connect}>
          Retry
        </button>
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button className="btn-primary wallet-connect" onClick={connect}>
        Connect Wallet
      </button>
    );
  }

  return (
    <div className="wallet-connect connected">
      <span className="address">{truncateAddress(address!)}</span>
      <button className="btn-secondary disconnect" onClick={disconnect}>
        Disconnect
      </button>
    </div>
  );
}

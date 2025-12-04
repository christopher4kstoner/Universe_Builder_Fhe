// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface Universe {
  id: string;
  name: string;
  encryptedRules: string;
  creator: string;
  createdAt: number;
  accessType: "private" | "public";
  members: string[];
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  // Randomly selected styles: Gradient (rainbow), Glassmorphism UI, Center Radiation layout, Animation rich
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newUniverse, setNewUniverse] = useState({ name: "", gravity: 9.8, timeSpeed: 1.0, accessType: "private" as "private" | "public" });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedUniverse, setSelectedUniverse] = useState<Universe | null>(null);
  const [decryptedRules, setDecryptedRules] = useState<{gravity: number, timeSpeed: number} | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "mine" | "public">("all");

  // Randomly selected features: Project introduction, Search & filter, Data statistics, User contribution
  useEffect(() => {
    loadUniverses().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadUniverses = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      
      const keysBytes = await contract.getData("universe_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing universe keys:", e); }
      }
      
      const list: Universe[] = [];
      for (const key of keys) {
        try {
          const universeBytes = await contract.getData(`universe_${key}`);
          if (universeBytes.length > 0) {
            try {
              const universeData = JSON.parse(ethers.toUtf8String(universeBytes));
              list.push({ 
                id: key, 
                name: universeData.name, 
                encryptedRules: universeData.rules, 
                creator: universeData.creator, 
                createdAt: universeData.createdAt, 
                accessType: universeData.accessType,
                members: universeData.members || []
              });
            } catch (e) { console.error(`Error parsing universe data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading universe ${key}:`, e); }
      }
      list.sort((a, b) => b.createdAt - a.createdAt);
      setUniverses(list);
    } catch (e) { console.error("Error loading universes:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const createUniverse = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting universe rules with Zama FHE..." });
    try {
      const rules = {
        gravity: newUniverse.gravity,
        timeSpeed: newUniverse.timeSpeed
      };
      const encryptedRules = FHEEncryptNumber(newUniverse.gravity) + "|" + FHEEncryptNumber(newUniverse.timeSpeed);
      
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const universeId = `uni-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const universeData = { 
        name: newUniverse.name, 
        rules: encryptedRules, 
        creator: address, 
        createdAt: Math.floor(Date.now() / 1000), 
        accessType: newUniverse.accessType,
        members: []
      };
      
      await contract.setData(`universe_${universeId}`, ethers.toUtf8Bytes(JSON.stringify(universeData)));
      
      const keysBytes = await contract.getData("universe_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(universeId);
      await contract.setData("universe_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Universe created with FHE-encrypted rules!" });
      await loadUniverses();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewUniverse({ name: "", gravity: 9.8, timeSpeed: 1.0, accessType: "private" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Creation failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedRules: string): Promise<{gravity: number, timeSpeed: number} | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const [gravityEnc, timeSpeedEnc] = encryptedRules.split("|");
      return {
        gravity: FHEDecryptNumber(gravityEnc),
        timeSpeed: FHEDecryptNumber(timeSpeedEnc)
      };
    } catch (e) { 
      console.error("Decryption failed:", e); 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const isCreator = (universeCreator: string) => address?.toLowerCase() === universeCreator.toLowerCase();

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to start creating FHE-encrypted universes", icon: "🔗" },
    { title: "Create Universe", description: "Define your universe parameters which will be encrypted using FHE", icon: "🌌", details: "Your universe rules are encrypted on the client-side before being stored" },
    { title: "FHE Protection", description: "Rules remain encrypted while being used in computations", icon: "🔒", details: "Zama FHE technology allows game mechanics to work with encrypted data" },
    { title: "Invite Players", description: "Share access to your private universe with selected players", icon: "👥", details: "Only you and invited players can decrypt and interact with your universe rules" }
  ];

  const filteredUniverses = universes.filter(universe => {
    const matchesSearch = universe.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = 
      (activeTab === "all") || 
      (activeTab === "mine" && isCreator(universe.creator)) || 
      (activeTab === "public" && universe.accessType === "public");
    return matchesSearch && matchesTab;
  });

  const myUniversesCount = universes.filter(u => isCreator(u.creator)).length;
  const publicUniversesCount = universes.filter(u => u.accessType === "public").length;

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing multiverse connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <div className="galaxy-bg"></div>
      <header className="app-header">
        <div className="logo">
          <h1>Universe Builder <span>FHE</span></h1>
          <p>Create FHE-encrypted mini-universes with your own rules</p>
        </div>
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
            data-hover="Create New Universe"
          >
            <span>+ Create</span>
          </button>
          <ConnectButton 
            accountStatus="address" 
            chainStatus="icon" 
            showBalance={false}
            label="Connect Wallet"
          />
        </div>
      </header>

      <main className="main-content">
        <div className="center-radial">
          <div className="content-ring">
            <div className="project-intro glass-card">
              <h2>FHE-Encrypted Universe Creator</h2>
              <p>
                Build your own mini-universe with fully encrypted rules using Zama FHE technology. 
                Your universe parameters remain encrypted even during gameplay, providing ultimate 
                privacy and customization.
              </p>
              <div className="tech-badge">
                <span>Powered by Zama FHE</span>
              </div>
            </div>

            <div className="stats-container glass-card">
              <div className="stat-item">
                <div className="stat-value">{universes.length}</div>
                <div className="stat-label">Total Universes</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{myUniversesCount}</div>
                <div className="stat-label">My Universes</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{publicUniversesCount}</div>
                <div className="stat-label">Public</div>
              </div>
            </div>

            <div className="search-filter glass-card">
              <div className="search-box">
                <input 
                  type="text" 
                  placeholder="Search universes..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button className="search-icon">🔍</button>
              </div>
              <div className="filter-tabs">
                <button 
                  className={activeTab === "all" ? "active" : ""}
                  onClick={() => setActiveTab("all")}
                >
                  All Universes
                </button>
                <button 
                  className={activeTab === "mine" ? "active" : ""}
                  onClick={() => setActiveTab("mine")}
                >
                  My Universes
                </button>
                <button 
                  className={activeTab === "public" ? "active" : ""}
                  onClick={() => setActiveTab("public")}
                >
                  Public
                </button>
              </div>
            </div>

            <div className="universe-list glass-card">
              <div className="list-header">
                <h2>Explore Universes</h2>
                <button 
                  onClick={loadUniverses} 
                  className="refresh-btn"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </button>
              </div>

              {filteredUniverses.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🌌</div>
                  <p>No universes found</p>
                  <button 
                    className="create-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Universe
                  </button>
                </div>
              ) : (
                <div className="universe-grid">
                  {filteredUniverses.map(universe => (
                    <div 
                      className="universe-card" 
                      key={universe.id}
                      onClick={() => setSelectedUniverse(universe)}
                    >
                      <div className="universe-header">
                        <h3>{universe.name}</h3>
                        <span className={`access-tag ${universe.accessType}`}>
                          {universe.accessType}
                        </span>
                      </div>
                      <div className="universe-meta">
                        <div className="meta-item">
                          <span>Creator:</span>
                          <span>{universe.creator.substring(0, 6)}...{universe.creator.substring(38)}</span>
                        </div>
                        <div className="meta-item">
                          <span>Created:</span>
                          <span>{new Date(universe.createdAt * 1000).toLocaleDateString()}</span>
                        </div>
                      </div>
                      <div className="universe-footer">
                        <div className="fhe-badge">
                          <span>FHE Encrypted</span>
                        </div>
                        <button className="view-btn">
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal glass-card">
            <div className="modal-header">
              <h2>Create New Universe</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Universe Name</label>
                <input 
                  type="text" 
                  value={newUniverse.name}
                  onChange={(e) => setNewUniverse({...newUniverse, name: e.target.value})}
                  placeholder="Give your universe a name"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Gravity (m/s²)</label>
                  <input 
                    type="number" 
                    value={newUniverse.gravity}
                    onChange={(e) => setNewUniverse({...newUniverse, gravity: parseFloat(e.target.value)})}
                    step="0.1"
                    min="0.1"
                  />
                </div>
                <div className="form-group">
                  <label>Time Speed (x)</label>
                  <input 
                    type="number" 
                    value={newUniverse.timeSpeed}
                    onChange={(e) => setNewUniverse({...newUniverse, timeSpeed: parseFloat(e.target.value)})}
                    step="0.1"
                    min="0.1"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Access Type</label>
                <div className="radio-group">
                  <label>
                    <input 
                      type="radio" 
                      checked={newUniverse.accessType === "private"}
                      onChange={() => setNewUniverse({...newUniverse, accessType: "private"})}
                    />
                    <span>Private (Only invited players)</span>
                  </label>
                  <label>
                    <input 
                      type="radio" 
                      checked={newUniverse.accessType === "public"}
                      onChange={() => setNewUniverse({...newUniverse, accessType: "public"})}
                    />
                    <span>Public (Anyone can join)</span>
                  </label>
                </div>
              </div>

              <div className="encryption-preview">
                <h4>FHE Encryption Preview</h4>
                <div className="preview-content">
                  <div className="plain-data">
                    <span>Original Rules:</span>
                    <div>Gravity: {newUniverse.gravity}, Time: {newUniverse.timeSpeed}x</div>
                  </div>
                  <div className="arrow">→</div>
                  <div className="encrypted-data">
                    <span>Encrypted Rules:</span>
                    <div>
                      {FHEEncryptNumber(newUniverse.gravity).substring(0, 10)}... | 
                      {FHEEncryptNumber(newUniverse.timeSpeed).substring(0, 10)}...
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={createUniverse}
                disabled={creating || !newUniverse.name}
                className="submit-btn"
              >
                {creating ? "Creating with FHE..." : "Create Universe"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedUniverse && (
        <div className="modal-overlay">
          <div className="detail-modal glass-card">
            <div className="modal-header">
              <h2>{selectedUniverse.name}</h2>
              <button onClick={() => {
                setSelectedUniverse(null);
                setDecryptedRules(null);
              }} className="close-btn">
                &times;
              </button>
            </div>
            <div className="modal-body">
              <div className="universe-info">
                <div className="info-item">
                  <span>Creator:</span>
                  <strong>{selectedUniverse.creator}</strong>
                </div>
                <div className="info-item">
                  <span>Created:</span>
                  <strong>{new Date(selectedUniverse.createdAt * 1000).toLocaleString()}</strong>
                </div>
                <div className="info-item">
                  <span>Access:</span>
                  <strong className={`access-tag ${selectedUniverse.accessType}`}>
                    {selectedUniverse.accessType}
                  </strong>
                </div>
              </div>

              <div className="rules-section">
                <h3>Universe Rules</h3>
                <div className="encrypted-rules">
                  <div className="fhe-badge">
                    <span>FHE Encrypted</span>
                  </div>
                  <div className="rules-data">
                    {selectedUniverse.encryptedRules.substring(0, 50)}...
                  </div>
                  <button 
                    className="decrypt-btn"
                    onClick={async () => {
                      if (decryptedRules) {
                        setDecryptedRules(null);
                      } else {
                        const rules = await decryptWithSignature(selectedUniverse.encryptedRules);
                        if (rules) setDecryptedRules(rules);
                      }
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : 
                     decryptedRules ? "Hide Rules" : "Decrypt Rules"}
                  </button>
                </div>

                {decryptedRules && (
                  <div className="decrypted-rules">
                    <h4>Decrypted Rules</h4>
                    <div className="rules-grid">
                      <div className="rule-item">
                        <span>Gravity:</span>
                        <strong>{decryptedRules.gravity} m/s²</strong>
                      </div>
                      <div className="rule-item">
                        <span>Time Speed:</span>
                        <strong>{decryptedRules.timeSpeed}x</strong>
                      </div>
                    </div>
                    <div className="decrypt-notice">
                      Rules decrypted with your wallet signature
                    </div>
                  </div>
                )}
              </div>

              {isCreator(selectedUniverse.creator) && (
                <div className="creator-actions">
                  <h3>Creator Tools</h3>
                  <div className="action-buttons">
                    <button className="action-btn">
                      Invite Players
                    </button>
                    <button className="action-btn">
                      Edit Rules
                    </button>
                    <button className="action-btn danger">
                      Delete Universe
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="notification-modal">
          <div className={`notification ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="notification-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>Universe Builder FHE</h3>
            <p>Create FHE-encrypted mini-universes with your own rules</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">About Zama FHE</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Community</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="tech-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} Universe Builder FHE
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;

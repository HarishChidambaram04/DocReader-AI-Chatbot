// components/library/Library.jsx
import React, { useState, useEffect } from 'react';
import { Search, Download, X, Grid, List, Crown } from 'lucide-react';

const Library = ({ isOpen, onClose, getAuthHeaders, user, chatLimits, onOpenUpgradeModal }) => {
  const [domains, setDomains] = useState([]);
  const [filteredDomains, setFilteredDomains] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);

  // ✅ Check if user is premium
  const isPremium = chatLimits?.remaining === -1;

  // Fetch domains on mount
  useEffect(() => {
    if (isOpen) {
      fetchDomains();
    }
  }, [isOpen]);

  // Filter domains when search/category changes
  useEffect(() => {
    filterDomains();
  }, [searchTerm, selectedCategory, domains]);

  const fetchDomains = async () => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8000/api/library/domains', {
        headers: getAuthHeaders()
      });

      if (!response.ok) throw new Error('Failed to fetch domains');

      const data = await response.json();
      setDomains(data.domains);
      setCategories(['All', ...data.categories]);
      setFilteredDomains(data.domains);
    } catch (error) {
      console.error('Error fetching domains:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterDomains = () => {
    let filtered = domains;

    if (selectedCategory !== 'All') {
      filtered = filtered.filter(d => d.category === selectedCategory);
    }

    if (searchTerm) {
      filtered = filtered.filter(d =>
        d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredDomains(filtered);
  };

  const handleDomainClick = (domain) => {
    // ✅ Check premium before opening download modal
    if (!isPremium) {
      onOpenUpgradeModal();
      return;
    }

    setSelectedDomain(domain);
    setDownloadModalOpen(true);
  };

  // Open Google Drive directly (only for premium users)
  const handleDownload = (type) => {
    if (!selectedDomain) return;

    // ✅ Double-check premium status
    if (!isPremium) {
      setDownloadModalOpen(false);
      onOpenUpgradeModal();
      return;
    }

    try {
      const folderId = selectedDomain.gdrive_folder_id;

      if (!folderId) {
        alert(`Google Drive folder not found for ${selectedDomain.name}`);
        return;
      }

      const driveUrl = `https://drive.google.com/drive/folders/${folderId}?usp=sharing`;

      const message = type === 'zip'
        ? `This will open the ${selectedDomain.name} folder in Google Drive.\n\nYou can download all files as a ZIP from there.\n\nContinue?`
        : `This will open the ${selectedDomain.name} folder in Google Drive.\n\nYou can select and download files from there.\n\nContinue?`;

      const confirmed = window.confirm(message);
      if (!confirmed) return;

      const newWindow = window.open(driveUrl, '_blank', 'noopener,noreferrer');

      if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
        alert('❌ Popup blocked!\n\nPlease allow popups for this site and try again.');
        return;
      }

      setDownloadModalOpen(false);
      trackDownload(selectedDomain.id, type);
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to open Google Drive. Please try again.');
    }
  };

  // Track downloads in backend
  const trackDownload = async (domainId, type) => {
    try {
      await fetch(`http://localhost:8000/api/library/track-download`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ domain_id: domainId, download_type: type })
      });
    } catch (error) {
      console.error('Error tracking download:', error);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-md">
      <div className="rounded-2xl w-full max-w-7xl h-5/6 shadow-2xl border border-white/40 
                      bg-white/40 backdrop-blur-2xl 
                      bg-gradient-to-br from-[#B3E5FC]/80 via-[#90CAF9]/80 to-[#E3F2FD]/90 
                      flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-[#5ac8fa] to-[#007aff] bg-clip-text text-transparent">
                📚 Data Library
              </h2>
              {/* ✅ Premium Badge */}
              {!isPremium && (
                <span className="px-3 py-1 bg-gradient-to-r from-yellow-400 to-orange-500 text-white text-sm font-semibold rounded-full flex items-center gap-1 shadow-md">
                  <Crown size={14} />
                  Premium Only
                </span>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-black/60 hover:text-black transition-colors"
            >
              <X size={24} />
            </button>
          </div>

          {/* Search and Filters */}
          <div className="flex gap-4 items-center">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-black/40" size={20} />
              <input
                type="text"
                placeholder="Search domains..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-lg 
                           bg-white/60 border border-white/40 
                           text-black placeholder-black/40 
                           focus:outline-none focus:border-[#007aff] focus:bg-white/80"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 rounded-lg 
                         bg-white/60 border border-white/40 
                         text-black focus:outline-none focus:border-[#007aff]"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            <div className="flex gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg border ${
                  viewMode === 'grid'
                    ? 'bg-[#007aff] text-white border-[#007aff]'
                    : 'bg-white/50 text-black/60 border-white/60'
                }`}
              >
                <Grid size={20} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg border ${
                  viewMode === 'list'
                    ? 'bg-[#007aff] text-white border-[#007aff]'
                    : 'bg-white/50 text-black/60 border-white/60'
                }`}
              >
                <List size={20} />
              </button>
            </div>
          </div>

          <div className="mt-4 text-black/60 text-sm">
            Showing {filteredDomains.length} of {domains.length} domains
          </div>
        </div>

        {/* Domain Grid/List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-black/80 text-xl">Loading domains...</div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredDomains.map(domain => (
                <DomainCard 
                  key={domain.id} 
                  domain={domain} 
                  onClick={() => handleDomainClick(domain)}
                  isPremium={isPremium}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredDomains.map(domain => (
                <DomainListItem 
                  key={domain.id} 
                  domain={domain} 
                  onClick={() => handleDomainClick(domain)}
                  isPremium={isPremium}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Download Modal (only for premium users) */}
      {downloadModalOpen && selectedDomain && isPremium && (
        <DownloadModal
          domain={selectedDomain}
          onClose={() => setDownloadModalOpen(false)}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
};

// ✅ Updated Domain Card Component
const DomainCard = ({ domain, onClick, isPremium }) => {
  const categoryColors = {
    'Government': 'bg-blue-500',
    'Economic': 'bg-green-500',
    'Social': 'bg-purple-500',
    'Technology': 'bg-cyan-500',
    'Infrastructure': 'bg-orange-500',
    'Environment': 'bg-teal-500',
    'Rural': 'bg-yellow-500',
    'Cultural': 'bg-pink-500',
    'Media': 'bg-red-500',
    'Entertainment': 'bg-indigo-500'
  };

  return (
    <div
      onClick={onClick}
      className="rounded-xl p-4 cursor-pointer transition-all hover:shadow-xl hover:scale-[1.02]
                 bg-white/70 border border-white/60 
                 hover:border-[#007aff] backdrop-blur-xl"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="text-black font-semibold text-lg">{domain.name}</h3>
        <span className={`px-2 py-1 rounded text-xs text-white shadow-sm ${categoryColors[domain.category] || 'bg-gray-500'}`}>
          {domain.category}
        </span>
      </div>

      <p className="text-black/70 text-sm mb-3 line-clamp-2">{domain.description}</p>

      <div className="flex items-center justify-between text-sm">
        <span className="text-black/60">{domain.file_count}</span>
        <span className="text-black/60">{domain.total_size_readable}</span>
      </div>

      {/* ✅ Conditional Button */}
      {isPremium ? (
        <button className="mt-3 w-full bg-gradient-to-r from-[#5ac8fa] to-[#007aff] 
                           hover:from-[#007aff] hover:to-[#005bbb]
                           text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md">
          <Download size={16} />
          Download
        </button>
      ) : (
        <button className="mt-3 w-full bg-gradient-to-r from-yellow-400 to-orange-500
                           hover:from-yellow-500 hover:to-orange-600
                           text-white py-2 rounded-lg transition-colors flex items-center justify-center gap-2 shadow-md">
          <Crown size={16} />
          Upgrade to Download
        </button>
      )}
    </div>
  );
};

// ✅ Updated Domain List Item Component
const DomainListItem = ({ domain, onClick, isPremium }) => {
  return (
    <div
      onClick={onClick}
      className="rounded-xl p-4 border border-white/60 bg-white/70 backdrop-blur-xl
                 hover:border-[#007aff] cursor-pointer transition-all flex items-center justify-between"
    >
      <div className="flex-1">
        <div className="flex items-center gap-3">
          <h3 className="text-black font-semibold">{domain.name}</h3>
          <span className="px-2 py-1 bg-white/80 rounded text-xs text-black/70 border border-white/70">
            {domain.category}
          </span>
        </div>
        <p className="text-black/70 text-sm mt-1">{domain.description}</p>
      </div>

      <div className="flex items-center gap-6 ml-4">
        <div className="text-right">
          <div className="text-black font-medium">{domain.file_count}</div>
          <div className="text-black/60 text-sm">{domain.total_size_readable}</div>
        </div>

        {/* ✅ Conditional Button */}
        {isPremium ? (
          <button className="bg-gradient-to-r from-[#5ac8fa] to-[#007aff] hover:from-[#007aff] hover:to-[#005bbb]
                             text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-md">
            <Download size={16} />
            Download
          </button>
        ) : (
          <button className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600
                             text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2 shadow-md">
            <Crown size={16} />
            Upgrade to Download
          </button>
        )}
      </div>
    </div>
  );
};

// Download Modal Component (unchanged)
const DownloadModal = ({ domain, onClose, onDownload }) => {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/40 backdrop-blur-md">
      <div className="rounded-xl p-6 max-w-md w-full border border-white/50 
                      bg-white/80 backdrop-blur-2xl shadow-2xl">
        <h3 className="text-2xl font-bold bg-gradient-to-r from-[#5ac8fa] to-[#007aff] bg-clip-text text-transparent mb-4">
          📂 {domain.name}
        </h3>

        <div className="mb-6">
          <p className="text-black/80 mb-2">
            <span className="text-black font-semibold">{domain.file_count}</span>
          </p>
          <p className="text-black/80">
            Size: <span className="text-black font-semibold">{domain.total_size_readable}</span>
          </p>
          <p className="text-black/60 text-sm mt-3">
            Files are hosted on Google Drive. Click below to access the folder.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => onDownload('zip')}
            className="w-full bg-gradient-to-r from-[#5ac8fa] to-[#007aff] hover:from-[#007aff] hover:to-[#005bbb]
                       text-white py-3 rounded-lg transition-colors font-semibold flex items-center justify-center gap-2 shadow-md"
          >
            <Download size={18} />
            Open in Google Drive
          </button>

          <button
            onClick={onClose}
            className="w-full bg-white/70 hover:bg-white text-black/80 py-3 rounded-lg transition-colors border border-white/70"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default Library;

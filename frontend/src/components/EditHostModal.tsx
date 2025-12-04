import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
} from '@mui/material';
import { hostsApi, UpdateHostRequest } from '../services/api';
import { Host } from '../types';

interface EditHostModalProps {
  host: Host;
  onClose: () => void;
  onSuccess: () => void;
}

const EditHostModal: React.FC<EditHostModalProps> = ({ host, onSuccess, onClose }) => {
  const [formData, setFormData] = useState<UpdateHostRequest>({
    hostname: host.hostname,
    port: host.port,
    username: host.username,
    ssh_key_path: host.ssh_key_path || '',
    password: '',
    description: host.description || '',
  });
  const [authMethod, setAuthMethod] = useState<'key' | 'password'>(host.ssh_key_path ? 'key' : 'password');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    // Validate that either key or password is provided
    if (authMethod === 'key' && !formData.ssh_key_path) {
      setError('SSH key path is required when using key authentication');
      setLoading(false);
      return;
    }
    if (authMethod === 'password' && !formData.password) {
      // If password is empty, don't update it (keep existing)
      delete formData.password;
    }

    try {
      const requestData: UpdateHostRequest = { ...formData };

      if (authMethod === 'key') {
        requestData.ssh_key_path = formData.ssh_key_path;
        requestData.password = undefined;
      } else {
        requestData.ssh_key_path = undefined;
        // Only include password if it was changed
        if (!formData.password) {
          delete requestData.password;
        }
      }

      await hostsApi.update(host.name, requestData);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to update host');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Edit Host: {host.name}</DialogTitle>
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} pt={1}>
          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Hostname/IP Address"
            value={formData.hostname}
            onChange={(e) => setFormData({ ...formData, hostname: e.target.value })}
            required
            fullWidth
          />

          <TextField
            label="SSH Port"
            type="number"
            value={formData.port}
            onChange={(e) => setFormData({ ...formData, port: parseInt(e.target.value) || 22 })}
            required
            fullWidth
            inputProps={{ min: 1, max: 65535 }}
          />

          <TextField
            label="Username"
            value={formData.username}
            onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            required
            fullWidth
          />

          <FormControl fullWidth>
            <InputLabel>Authentication Method</InputLabel>
            <Select
              value={authMethod}
              label="Authentication Method"
              onChange={(e) => setAuthMethod(e.target.value as 'key' | 'password')}
            >
              <MenuItem value="key">SSH Key</MenuItem>
              <MenuItem value="password">Password</MenuItem>
            </Select>
          </FormControl>

          {authMethod === 'key' ? (
            <TextField
              label="SSH Key Path"
              value={formData.ssh_key_path || ''}
              onChange={(e) => setFormData({ ...formData, ssh_key_path: e.target.value })}
              required
              fullWidth
            />
          ) : (
            <TextField
              label="Password"
              type="password"
              value={formData.password || ''}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              fullWidth
              placeholder="Leave empty to keep existing password"
              helperText="Leave empty to keep existing password"
            />
          )}

          <TextField
            label="Description"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            fullWidth
            multiline
            rows={2}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          disabled={loading}
        >
          {loading ? 'Updating...' : 'Update Host'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditHostModal;

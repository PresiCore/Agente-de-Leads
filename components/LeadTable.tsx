import React from 'react';
import { Lead } from '../types';
import { AlertCircle, CheckCircle, Mail, Globe, User, Linkedin, Facebook, Instagram, Twitter, Link as LinkIcon, Building2 } from 'lucide-react';

interface LeadTableProps {
  leads: Lead[];
}

const SocialIcon: React.FC<{ url: string }> = ({ url }) => {
  const lowerUrl = url.toLowerCase();
  let Icon = LinkIcon;
  let colorClass = "text-gray-400 hover:text-gray-600";

  if (lowerUrl.includes('linkedin')) {
    Icon = Linkedin;
    colorClass = "text-blue-600 hover:text-blue-800";
  } else if (lowerUrl.includes('facebook')) {
    Icon = Facebook;
    colorClass = "text-blue-500 hover:text-blue-700";
  } else if (lowerUrl.includes('instagram')) {
    Icon = Instagram;
    colorClass = "text-pink-600 hover:text-pink-800";
  } else if (lowerUrl.includes('twitter') || lowerUrl.includes('x.com')) {
    Icon = Twitter;
    colorClass = "text-sky-500 hover:text-sky-700";
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" className={`transition-colors ${colorClass}`}>
      <Icon size={14} />
    </a>
  );
};

export const LeadTable: React.FC<LeadTableProps> = ({ leads }) => {
  if (leads.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 shadow-sm bg-white">
      <table className="w-full text-sm text-left text-gray-500">
        <thead className="text-xs text-gray-700 uppercase bg-gray-50">
          <tr>
            <th className="px-6 py-3">Empresa</th>
            <th className="px-6 py-3">Decisor & Rol</th>
            <th className="px-6 py-3">Contacto Digital</th>
            <th className="px-6 py-3 text-center">Need Score</th>
            <th className="px-6 py-3">Motivo / Análisis</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead, index) => (
            <tr key={index} className="bg-white border-b hover:bg-gray-50">
              <td className="px-6 py-4">
                <div className="font-medium text-gray-900 whitespace-nowrap flex items-center gap-2">
                  <Building2 size={16} className="text-gray-400" />
                  {lead.companyName}
                </div>
                {lead.website !== 'N/A' && (
                  <a href={`https://${lead.website.replace(/^https?:\/\//, '')}`} target="_blank" rel="noreferrer" className="mt-1 text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                     <Globe size={12} /> {lead.website}
                  </a>
                )}
              </td>
              <td className="px-6 py-4">
                 <div className="flex flex-col">
                    {lead.contactName ? (
                        <div className="flex items-center gap-2 text-gray-900 font-medium">
                            <User size={16} className="text-indigo-500" />
                            {lead.contactName}
                        </div>
                    ) : (
                        <span className="text-gray-400 text-xs italic">Nombre no disponible</span>
                    )}
                    <span className="text-xs text-indigo-600 font-medium mt-0.5 ml-6">
                        {lead.role || 'Rol Desconocido'}
                    </span>
                 </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                        <Mail size={16} className="text-gray-400" />
                        <span className={lead.email === 'N/A' ? 'text-gray-400 italic' : 'text-gray-700 font-medium select-all'}>
                            {lead.email}
                        </span>
                    </div>
                    {lead.socialLinks && lead.socialLinks.length > 0 && (
                        <div className="flex items-center gap-2 ml-6">
                            {lead.socialLinks.map((link, i) => (
                                <SocialIcon key={i} url={link} />
                            ))}
                        </div>
                    )}
                </div>
              </td>
              <td className="px-6 py-4 text-center">
                <div className="flex items-center justify-center gap-1">
                    <div className="w-16 bg-gray-200 rounded-full h-2.5">
                        <div 
                            className={`h-2.5 rounded-full ${lead.needScore >= 4 ? 'bg-red-500' : lead.needScore >= 3 ? 'bg-yellow-400' : 'bg-green-500'}`} 
                            style={{ width: `${(lead.needScore / 5) * 100}%` }}
                        ></div>
                    </div>
                    <span className="text-xs font-bold ml-1">{lead.needScore}</span>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-start gap-2 max-w-xs">
                    <AlertCircle size={16} className="text-gray-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-gray-600 truncate hover:text-clip hover:whitespace-normal transition-all duration-300">
                        {lead.reason}
                    </p>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
#pragma once

class c_global_vars
{
public:
	float m_curtime()
	{
		static const auto offset = []()
		{
			if (const auto value = schema::get_offset(fnv1a::hash_const("CGlobalVarsBase->m_flCurrentTime")))
				return value;
			return schema::get_offset(fnv1a::hash_const("CGlobalVarsBase->m_flCurTime"));
		}();
		const auto base = reinterpret_cast<uintptr_t>(this);
		if (offset)
			return m_memory->read_t<float>(base + offset);
		return m_memory->read_t<float>(base + 0x30);
	}

	std::string m_map_name()
	{
		static const auto offset = []()
		{
			if (const auto value = schema::get_offset(fnv1a::hash_const("CGlobalVarsBase->m_szMapName")))
				return value;
			if (const auto value = schema::get_offset(fnv1a::hash_const("CGlobalVars->m_szMapName")))
				return value;
			return schema::get_offset(fnv1a::hash_const("CGlobalVarsBase->m_mapName"));
		}();
		const auto base = reinterpret_cast<uintptr_t>(this);
		const auto name_ptr = offset ? m_memory->read_t<uintptr_t>(base + offset)
					      : m_memory->read_t<uintptr_t>(base + 0x180);
		if (!name_ptr)
			return {};
		return m_memory->read_t<std::string>(name_ptr);
	}
};
